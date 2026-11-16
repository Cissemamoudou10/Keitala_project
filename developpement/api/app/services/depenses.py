"""Dépenses d'exploitation (US-TRES-02) : catégorie obligatoire, compte payeur,
annulation par contre-passation, jamais de suppression (règles 4 et 5)."""

import uuid
from datetime import UTC, date, datetime

from fastapi import status
from sqlalchemy import Select, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.erreurs import ErreurMetier
from app.db.pagination import paginer
from app.db.recherche import contient
from app.models import CategorieDepense, CompteTresorerie, Depense, Utilisateur
from app.models.enums import StatutDocument, TypeFluxTresorerie
from app.schemas.common import PaginationParams
from app.schemas.depenses import CategorieLecture, DepenseCreation, DepenseLecture
from app.services.numerotation import prochain_numero
from app.services.pieces import aujourd_hui, verrouiller_comptes
from app.services.stocks import noms_des_auteurs
from app.services.tresorerie import ecrire_mouvement_tresorerie


def _introuvable() -> ErreurMetier:
    return ErreurMetier(
        "DEPENSE_INTROUVABLE", "Cette dépense n'existe pas.", status.HTTP_404_NOT_FOUND
    )


def date_passee(jour: date | None, champ: str) -> date:
    """Date saisie, ou aujourd'hui ; jamais dans le futur."""
    valeur = jour or aujourd_hui()
    if valeur > aujourd_hui():
        raise ErreurMetier(
            "DATE_FUTURE", "La date ne peut pas être dans le futur.", details={"champ": champ}
        )
    return valeur


async def lister_categories(session: AsyncSession) -> list[CategorieLecture]:
    categories = await session.execute(select(CategorieDepense).order_by(CategorieDepense.id))
    return [
        CategorieLecture(id=c.id, nom=c.nom, description=c.description)
        for c in categories.scalars()
    ]


async def _lectures(session: AsyncSession, depenses: list[Depense]) -> list[DepenseLecture]:
    categories = {c.id: c.nom for c in (await session.execute(select(CategorieDepense))).scalars()}
    comptes = {c.id: c.nom for c in (await session.execute(select(CompteTresorerie))).scalars()}
    auteurs = await noms_des_auteurs(
        session,
        [u for d in depenses for u in (d.cree_par, d.annule_par, d.controle_par) if u is not None],
    )
    return [
        DepenseLecture(
            id=d.id,
            numero=d.numero,
            date_depense=d.date_depense,
            categorie_id=d.categorie_id,
            categorie=categories.get(d.categorie_id, ""),
            compte_id=d.compte_id,
            compte=comptes.get(d.compte_id, ""),
            designation=d.designation,
            montant=d.montant,
            reference_paiement=d.reference_paiement,
            piece_justificative=d.piece_justificative,
            statut=d.statut,
            auteur=auteurs.get(d.cree_par, ""),
            date_creation=d.date_creation,
            annule_le=d.annule_le,
            annule_par=auteurs.get(d.annule_par) if d.annule_par else None,
            motif_annulation=d.motif_annulation,
            controle_le=d.controle_le,
            controle_par=auteurs.get(d.controle_par) if d.controle_par else None,
        )
        for d in depenses
    ]


async def lister_depenses(
    session: AsyncSession,
    pagination: PaginationParams,
    *,
    categorie_id: int | None = None,
    compte_id: int | None = None,
    du: date | None = None,
    au: date | None = None,
    recherche: str | None = None,
) -> tuple[list[DepenseLecture], int, int]:
    requete: Select[Depense] = select(Depense)
    if categorie_id is not None:
        requete = requete.where(Depense.categorie_id == categorie_id)
    if compte_id is not None:
        requete = requete.where(Depense.compte_id == compte_id)
    if du is not None:
        requete = requete.where(Depense.date_depense >= du)
    if au is not None:
        requete = requete.where(Depense.date_depense <= au)
    if recherche and recherche.strip():
        requete = requete.where(
            contient(recherche, Depense.numero, Depense.designation, Depense.piece_justificative)
        )
    requete = requete.order_by(Depense.date_depense.desc(), Depense.date_creation.desc())
    depenses, total, pages = await paginer(session, requete, pagination)
    return await _lectures(session, depenses), total, pages


async def lire_depense(session: AsyncSession, depense_id: uuid.UUID) -> DepenseLecture:
    depense = await session.get(Depense, depense_id, populate_existing=True)
    if depense is None:
        raise _introuvable()
    return (await _lectures(session, [depense]))[0]


async def _par_cle(session: AsyncSession, cle: uuid.UUID) -> uuid.UUID | None:
    return await session.scalar(select(Depense.id).where(Depense.cle_idempotence == cle))


async def creer_depense(
    session: AsyncSession, donnees: DepenseCreation, auteur: Utilisateur
) -> tuple[DepenseLecture, bool]:
    """Renvoie (dépense, créée). Un second envoi avec la même clé renvoie l'existante."""
    existante = await _par_cle(session, donnees.cle_idempotence)
    if existante is not None:
        return await lire_depense(session, existante), False
    jour = date_passee(donnees.date_depense, "date_depense")
    if await session.get(CategorieDepense, donnees.categorie_id) is None:
        raise ErreurMetier(
            "CATEGORIE_INTROUVABLE",
            "Choisissez une catégorie de la liste.",
            details={"champ": "categorie_id"},
        )
    compte = (await verrouiller_comptes(session, {donnees.compte_id}))[donnees.compte_id]

    depense = Depense(
        numero=await prochain_numero(session, "DEP", jour),
        categorie_id=donnees.categorie_id,
        compte_id=compte.id,
        date_depense=jour,
        designation=donnees.designation.strip(),
        montant=donnees.montant,
        reference_paiement=(donnees.reference_paiement or "").strip() or None,
        piece_justificative=(donnees.piece_justificative or "").strip() or None,
        cree_par=auteur.id,
        cle_idempotence=donnees.cle_idempotence,
    )
    session.add(depense)
    await session.flush()
    # Refusée si une caisse ou un compte Mobile Money n'a pas l'argent (D-030)
    await ecrire_mouvement_tresorerie(
        session,
        compte,
        type_flux=TypeFluxTresorerie.DEPENSE_EXPLOITATION,
        sens="DEBIT",
        montant=donnees.montant,
        libelle=f"Dépense {depense.numero} — {depense.designation}"[:255],
        utilisateur_id=auteur.id,
        depense_id=depense.id,
    )
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        existante = await _par_cle(session, donnees.cle_idempotence)
        if existante is None:
            raise
        return await lire_depense(session, existante), False
    return await lire_depense(session, depense.id), True


async def annuler_depense(
    session: AsyncSession, depense_id: uuid.UUID, motif: str, auteur: Utilisateur
) -> DepenseLecture:
    """Statut ANNULE, montant rendu au compte payeur (écriture inverse, règle 4)."""
    depense = (
        await session.execute(select(Depense).where(Depense.id == depense_id).with_for_update())
    ).scalar_one_or_none()
    if depense is None:
        raise _introuvable()
    if depense.statut != StatutDocument.VALIDE:
        raise ErreurMetier("DEPENSE_ANNULEE", f"La dépense {depense.numero} est déjà annulée.", 409)
    compte = (await verrouiller_comptes(session, {depense.compte_id}, actifs=False))[
        depense.compte_id
    ]
    await ecrire_mouvement_tresorerie(
        session,
        compte,
        type_flux=TypeFluxTresorerie.ANNULATION,
        sens="CREDIT",
        montant=depense.montant,
        libelle=f"Annulation de la dépense {depense.numero}",
        utilisateur_id=auteur.id,
        depense_id=depense.id,
    )
    depense.statut = StatutDocument.ANNULE
    depense.annule_par = auteur.id
    depense.annule_le = datetime.now(UTC)
    depense.motif_annulation = motif.strip()
    await session.commit()
    return await lire_depense(session, depense_id)
