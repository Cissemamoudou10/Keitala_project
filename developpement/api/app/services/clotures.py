"""Clôture journalière d'un compte (US-TRES-04) : récapitulatif calculé depuis le
journal (ouverture + entrées − sorties = théorique), montant constaté, écart.

Un écart s'inscrit au journal (`ECART_CLOTURE`) pour que le solde suive ce qui est
réellement dans le tiroir ou sur le compte (D-033) ; il exige un commentaire."""

import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from fastapi import status
from sqlalchemy import Select, case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.erreurs import ErreurMetier
from app.db.pagination import paginer
from app.models import ClotureCaisse, CompteTresorerie, TransactionTresorerie, Utilisateur
from app.models.enums import TypeFluxTresorerie
from app.schemas.common import PaginationParams
from app.schemas.depenses import ClotureCreation, ClotureLecture, PreparationCloture
from app.services.depenses import date_passee
from app.services.pieces import fcfa, verrouiller_comptes
from app.services.stocks import FUSEAU, noms_des_auteurs
from app.services.tresorerie import ecrire_mouvement_tresorerie


def _bornes(jour: date) -> tuple[datetime, datetime]:
    debut = datetime.combine(jour, time.min, tzinfo=FUSEAU)
    return debut, debut + timedelta(days=1)


async def _deja_cloturee(session: AsyncSession, compte_id: int, jour: date) -> bool:
    return (
        await session.scalar(
            select(ClotureCaisse.id).where(
                ClotureCaisse.compte_id == compte_id, ClotureCaisse.date_cloture == jour
            )
        )
    ) is not None


async def _recapitulatif(
    session: AsyncSession, compte: CompteTresorerie, jour: date
) -> PreparationCloture:
    debut, fin = _bornes(jour)
    # Solde à l'ouverture : celui de la dernière écriture d'avant le jour (0 sinon)
    ouverture = await session.scalar(
        select(TransactionTresorerie.solde_apres)
        .where(
            TransactionTresorerie.compte_id == compte.id,
            TransactionTresorerie.date_transaction < debut,
        )
        .order_by(TransactionTresorerie.date_transaction.desc(), TransactionTresorerie.id.desc())
        .limit(1)
    )
    entrees, sorties = (
        await session.execute(
            select(
                func.coalesce(
                    func.sum(
                        case(
                            (TransactionTresorerie.sens == "CREDIT", TransactionTresorerie.montant),
                            else_=0,
                        )
                    ),
                    0,
                ),
                func.coalesce(
                    func.sum(
                        case(
                            (TransactionTresorerie.sens == "DEBIT", TransactionTresorerie.montant),
                            else_=0,
                        )
                    ),
                    0,
                ),
            ).where(
                TransactionTresorerie.compte_id == compte.id,
                TransactionTresorerie.date_transaction >= debut,
                TransactionTresorerie.date_transaction < fin,
            )
        )
    ).one()
    solde_ouverture = Decimal(ouverture or 0)
    return PreparationCloture(
        compte_id=compte.id,
        compte=compte.nom,
        date_cloture=jour,
        solde_ouverture=solde_ouverture,
        total_entrees=Decimal(entrees),
        total_sorties=Decimal(sorties),
        solde_theorique=solde_ouverture + Decimal(entrees) - Decimal(sorties),
        deja_cloturee=await _deja_cloturee(session, compte.id, jour),
    )


async def preparer_cloture(
    session: AsyncSession, compte_id: int, jour: date | None
) -> PreparationCloture:
    compte = await session.get(CompteTresorerie, compte_id)
    if compte is None:
        raise ErreurMetier(
            "COMPTE_INTROUVABLE", "Ce compte de trésorerie n'existe pas.", status.HTTP_404_NOT_FOUND
        )
    return await _recapitulatif(session, compte, date_passee(jour, "date_cloture"))


async def _lectures(session: AsyncSession, clotures: list[ClotureCaisse]) -> list[ClotureLecture]:
    comptes = {c.id: c.nom for c in (await session.execute(select(CompteTresorerie))).scalars()}
    auteurs = await noms_des_auteurs(
        session, [u for c in clotures for u in (c.cree_par, c.controle_par) if u is not None]
    )
    return [
        ClotureLecture(
            id=c.id,
            compte_id=c.compte_id,
            compte=comptes.get(c.compte_id, ""),
            date_cloture=c.date_cloture,
            solde_ouverture=c.solde_ouverture,
            total_entrees=c.total_entrees,
            total_sorties=c.total_sorties,
            solde_theorique=c.solde_theorique,
            solde_physique=c.solde_physique,
            ecart=c.ecart,
            commentaire=c.commentaire,
            auteur=auteurs.get(c.cree_par, ""),
            date_creation=c.date_creation,
            controle_le=c.controle_le,
            controle_par=auteurs.get(c.controle_par) if c.controle_par else None,
        )
        for c in clotures
    ]


async def lister_clotures(
    session: AsyncSession,
    pagination: PaginationParams,
    *,
    compte_id: int | None = None,
    du: date | None = None,
    au: date | None = None,
) -> tuple[list[ClotureLecture], int, int]:
    requete: Select[ClotureCaisse] = select(ClotureCaisse)
    if compte_id is not None:
        requete = requete.where(ClotureCaisse.compte_id == compte_id)
    if du is not None:
        requete = requete.where(ClotureCaisse.date_cloture >= du)
    if au is not None:
        requete = requete.where(ClotureCaisse.date_cloture <= au)
    requete = requete.order_by(
        ClotureCaisse.date_cloture.desc(), ClotureCaisse.date_creation.desc()
    )
    clotures, total, pages = await paginer(session, requete, pagination)
    return await _lectures(session, clotures), total, pages


def _deja_faite(compte: str, jour: date) -> ErreurMetier:
    return ErreurMetier(
        "CLOTURE_DEJA_FAITE",
        f"« {compte} » est déjà clôturé pour le {jour.strftime('%d/%m/%Y')}.",
        status.HTTP_409_CONFLICT,
    )


async def cloturer(
    session: AsyncSession, donnees: ClotureCreation, auteur: Utilisateur
) -> ClotureLecture:
    jour = date_passee(donnees.date_cloture, "date_cloture")
    compte = (await verrouiller_comptes(session, {donnees.compte_id}, actifs=False)).get(
        donnees.compte_id
    )
    if compte is None:
        raise ErreurMetier(
            "COMPTE_INTROUVABLE", "Ce compte de trésorerie n'existe pas.", status.HTTP_404_NOT_FOUND
        )
    recap = await _recapitulatif(session, compte, jour)
    if recap.deja_cloturee:
        raise _deja_faite(compte.nom, jour)
    ecart = donnees.solde_physique - recap.solde_theorique
    commentaire = (donnees.commentaire or "").strip() or None
    if ecart != 0 and commentaire is None:
        raise ErreurMetier(
            "COMMENTAIRE_REQUIS",
            f"Écart de {fcfa(abs(ecart))} : expliquez-le dans le commentaire.",
            details={"champ": "commentaire"},
        )

    cloture = ClotureCaisse(
        compte_id=compte.id,
        date_cloture=jour,
        solde_ouverture=recap.solde_ouverture,
        total_entrees=recap.total_entrees,
        total_sorties=recap.total_sorties,
        solde_physique=donnees.solde_physique,
        commentaire=commentaire,
        cree_par=auteur.id,
    )
    session.add(cloture)
    try:
        await session.flush()
    except IntegrityError as erreur:  # clôture simultanée du même compte, le même jour
        await session.rollback()
        raise _deja_faite(compte.nom, jour) from erreur
    if ecart != 0:
        # Le solde suit le constaté : excédent au crédit, manquant au débit
        await ecrire_mouvement_tresorerie(
            session,
            compte,
            type_flux=TypeFluxTresorerie.ECART_CLOTURE,
            sens="CREDIT" if ecart > 0 else "DEBIT",
            montant=abs(ecart),
            libelle=f"Écart de clôture du {jour.strftime('%d/%m/%Y')} — {commentaire}"[:255],
            utilisateur_id=auteur.id,
            cloture_id=cloture.id,
        )
    await session.commit()
    return await lire_cloture(session, cloture.id)


async def lire_cloture(session: AsyncSession, cloture_id: uuid.UUID) -> ClotureLecture:
    cloture = await session.get(ClotureCaisse, cloture_id, populate_existing=True)
    if cloture is None:
        raise ErreurMetier(
            "CLOTURE_INTROUVABLE", "Cette clôture n'existe pas.", status.HTTP_404_NOT_FOUND
        )
    return (await _lectures(session, [cloture]))[0]
