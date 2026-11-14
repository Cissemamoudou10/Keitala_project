"""Comptes de trésorerie (US-REF-03) et écriture unique dans le journal de trésorerie.

Règles 3, 4 et 6 d'AGENTS.md : toute variation de solde passe par
`ecrire_mouvement_tresorerie`, qui verrouille le compte, écrit la ligne du journal
(immuable) et met à jour `solde_actuel`, dans la transaction de l'appelant.
"""

import re
import unicodedata
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Literal

from fastapi import status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.erreurs import ErreurMetier
from app.models import CompteTresorerie, TransactionTresorerie
from app.models.enums import TypeFluxTresorerie
from app.schemas.tresorerie import CompteCreation, CompteLecture, CompteModification

Sens = Literal["CREDIT", "DEBIT"]


def _compte_introuvable() -> ErreurMetier:
    return ErreurMetier(
        "COMPTE_INTROUVABLE", "Ce compte de trésorerie n'existe pas.", status.HTTP_404_NOT_FOUND
    )


async def verrouiller_compte(session: AsyncSession, compte_id: int) -> CompteTresorerie:
    """SELECT ... FOR UPDATE : à appeler avant toute écriture touchant le solde."""
    compte = (
        await session.execute(
            select(CompteTresorerie).where(CompteTresorerie.id == compte_id).with_for_update()
        )
    ).scalar_one_or_none()
    if compte is None:
        raise _compte_introuvable()
    return compte


async def ecrire_mouvement_tresorerie(
    session: AsyncSession,
    compte: CompteTresorerie,
    *,
    type_flux: TypeFluxTresorerie,
    sens: Sens,
    montant: Decimal,
    libelle: str,
    utilisateur_id: uuid.UUID,
    reglement_id: uuid.UUID | None = None,
    depense_id: uuid.UUID | None = None,
    transfert_id: uuid.UUID | None = None,
    cloture_id: uuid.UUID | None = None,
) -> TransactionTresorerie:
    """Seule fonction qui modifie un solde. Le compte doit avoir été verrouillé.

    N'effectue pas le commit : l'opération métier appelante valide tout ensemble.
    """
    solde_avant = compte.solde_actuel
    solde_apres = solde_avant + montant if sens == "CREDIT" else solde_avant - montant
    ecriture = TransactionTresorerie(
        compte_id=compte.id,
        type_flux=type_flux,
        sens=sens,
        montant=montant,
        solde_avant=solde_avant,
        solde_apres=solde_apres,
        libelle=libelle,
        reglement_id=reglement_id,
        depense_id=depense_id,
        transfert_id=transfert_id,
        cloture_id=cloture_id,
        utilisateur_id=utilisateur_id,
    )
    session.add(ecriture)
    compte.solde_actuel = solde_apres
    compte.date_mise_a_jour = datetime.now(UTC)
    await session.flush()
    return ecriture


async def _comptes_avec_solde_ouverture(session: AsyncSession) -> set[int]:
    requete = select(TransactionTresorerie.compte_id).where(
        TransactionTresorerie.type_flux == TypeFluxTresorerie.SOLDE_INITIAL
    )
    return set((await session.execute(requete)).scalars().all())


def _lecture(compte: CompteTresorerie, avec_ouverture: set[int]) -> CompteLecture:
    lecture = CompteLecture.model_validate(compte)
    lecture.solde_ouverture_saisi = compte.id in avec_ouverture
    return lecture


async def lister_comptes(session: AsyncSession) -> list[CompteLecture]:
    # Actifs d'abord, dans l'ordre de création (Caisse, Banque, Mobile Money…)
    comptes = (
        await session.execute(
            select(CompteTresorerie).order_by(
                CompteTresorerie.est_actif.desc(), CompteTresorerie.id
            )
        )
    ).scalars()
    avec_ouverture = await _comptes_avec_solde_ouverture(session)
    return [_lecture(compte, avec_ouverture) for compte in comptes]


async def lire_compte(session: AsyncSession, compte_id: int) -> CompteLecture:
    compte = await session.get(CompteTresorerie, compte_id)
    if compte is None:
        raise _compte_introuvable()
    return _lecture(compte, await _comptes_avec_solde_ouverture(session))


def _code_depuis_nom(nom: str) -> str:
    """« Banque BDM Bamako » → « BANQUE_BDM_BAMAKO » (20 caractères au plus)."""
    sans_accents = unicodedata.normalize("NFKD", nom).encode("ascii", "ignore").decode()
    return (re.sub(r"[^A-Z0-9]+", "_", sans_accents.upper()).strip("_") or "COMPTE")[:20]


def _nom_deja_utilise(nom: str) -> ErreurMetier:
    return ErreurMetier(
        "NOM_DEJA_UTILISE",
        f"Un compte s'appelle déjà « {nom} ». Choisissez un autre nom.",
        status.HTTP_409_CONFLICT,
        {"champ": "nom"},
    )


async def _nom_existe(session: AsyncSession, nom: str, sauf: int | None = None) -> bool:
    requete = select(CompteTresorerie.id).where(
        func.lower(CompteTresorerie.nom) == nom.strip().lower()
    )
    if sauf is not None:
        requete = requete.where(CompteTresorerie.id != sauf)
    return (await session.execute(requete)).first() is not None


async def creer_compte(session: AsyncSession, donnees: CompteCreation) -> CompteLecture:
    nom = donnees.nom.strip()
    if await _nom_existe(session, nom):
        raise _nom_deja_utilise(nom)

    # Code technique unique, déduit du nom (BANQUE_BDM, BANQUE_BDM_2…)
    base = _code_depuis_nom(nom)
    codes = set(
        (
            await session.execute(
                select(CompteTresorerie.code).where(CompteTresorerie.code.like(f"{base[:17]}%"))
            )
        ).scalars()
    )
    code, rang = base, 2
    while code in codes:
        code = f"{base[:17]}_{rang}"
        rang += 1

    compte = CompteTresorerie(
        code=code,
        nom=nom,
        type=donnees.type,
        operateur=donnees.operateur.strip() if donnees.operateur else None,
    )
    session.add(compte)
    try:
        await session.commit()
    except IntegrityError as erreur:  # création simultanée du même nom
        await session.rollback()
        raise _nom_deja_utilise(nom) from erreur
    await session.refresh(compte)
    return _lecture(compte, set())


async def modifier_compte(
    session: AsyncSession, compte_id: int, donnees: CompteModification
) -> CompteLecture:
    compte = await verrouiller_compte(session, compte_id)
    if donnees.nom is not None and donnees.nom.strip() != compte.nom:
        if await _nom_existe(session, donnees.nom, sauf=compte.id):
            raise _nom_deja_utilise(donnees.nom.strip())
        compte.nom = donnees.nom.strip()
    if donnees.est_actif is not None:
        compte.est_actif = donnees.est_actif
    compte.date_mise_a_jour = datetime.now(UTC)
    await session.commit()
    return await lire_compte(session, compte_id)


async def saisir_solde_ouverture(
    session: AsyncSession, compte_id: int, montant: Decimal, utilisateur_id: uuid.UUID
) -> CompteLecture:
    """Solde réel du compte à la mise en service (US-REF-03), saisi une seule fois."""
    compte = await verrouiller_compte(session, compte_id)
    deja_saisi = (
        await session.execute(
            select(TransactionTresorerie.id).where(
                TransactionTresorerie.compte_id == compte_id,
                TransactionTresorerie.type_flux == TypeFluxTresorerie.SOLDE_INITIAL,
            )
        )
    ).first()
    if deja_saisi is not None:
        raise ErreurMetier(
            "SOLDE_OUVERTURE_DEJA_SAISI",
            f"Le solde d'ouverture de « {compte.nom} » a déjà été saisi. "
            "Il ne se modifie pas : une erreur se corrigera par une écriture de correction.",
            status.HTTP_409_CONFLICT,
        )
    if not compte.est_actif:
        raise ErreurMetier(
            "COMPTE_INACTIF", f"Le compte « {compte.nom} » est désactivé. Réactivez-le d'abord."
        )

    await ecrire_mouvement_tresorerie(
        session,
        compte,
        type_flux=TypeFluxTresorerie.SOLDE_INITIAL,
        sens="CREDIT",
        montant=montant,
        libelle="Solde d'ouverture",
        utilisateur_id=utilisateur_id,
    )
    await session.commit()
    return await lire_compte(session, compte_id)
