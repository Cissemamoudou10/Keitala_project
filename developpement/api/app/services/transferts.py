"""Transferts entre comptes (US-TRES-03) : débit de la source et crédit de la
destination du même montant, dans une seule transaction, sans effet sur le résultat.
Pas d'annulation (le schéma n'en prévoit pas) : une erreur se corrige par un transfert
dans l'autre sens."""

import uuid
from datetime import date

from fastapi import status
from sqlalchemy import Select, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.erreurs import ErreurMetier
from app.db.pagination import paginer
from app.models import CompteTresorerie, TransfertInterne, Utilisateur
from app.models.enums import TypeFluxTresorerie
from app.schemas.common import PaginationParams
from app.schemas.depenses import TransfertCreation, TransfertLecture
from app.services.depenses import date_passee
from app.services.numerotation import prochain_numero
from app.services.pieces import verrouiller_comptes
from app.services.stocks import noms_des_auteurs
from app.services.tresorerie import ecrire_mouvement_tresorerie


async def _lectures(
    session: AsyncSession, transferts: list[TransfertInterne]
) -> list[TransfertLecture]:
    comptes = {c.id: c.nom for c in (await session.execute(select(CompteTresorerie))).scalars()}
    auteurs = await noms_des_auteurs(
        session,
        [u for t in transferts for u in (t.cree_par, t.controle_par) if u is not None],
    )
    return [
        TransfertLecture(
            id=t.id,
            numero=t.numero,
            date_transfert=t.date_transfert,
            compte_source_id=t.compte_source_id,
            compte_source=comptes.get(t.compte_source_id, ""),
            compte_destination_id=t.compte_destination_id,
            compte_destination=comptes.get(t.compte_destination_id, ""),
            montant=t.montant,
            libelle=t.libelle,
            reference_paiement=t.reference_paiement,
            auteur=auteurs.get(t.cree_par, ""),
            date_creation=t.date_creation,
            controle_le=t.controle_le,
            controle_par=auteurs.get(t.controle_par) if t.controle_par else None,
        )
        for t in transferts
    ]


async def lister_transferts(
    session: AsyncSession,
    pagination: PaginationParams,
    *,
    compte_id: int | None = None,
    du: date | None = None,
    au: date | None = None,
) -> tuple[list[TransfertLecture], int, int]:
    requete: Select[TransfertInterne] = select(TransfertInterne)
    if compte_id is not None:
        requete = requete.where(
            or_(
                TransfertInterne.compte_source_id == compte_id,
                TransfertInterne.compte_destination_id == compte_id,
            )
        )
    if du is not None:
        requete = requete.where(TransfertInterne.date_transfert >= du)
    if au is not None:
        requete = requete.where(TransfertInterne.date_transfert <= au)
    requete = requete.order_by(
        TransfertInterne.date_transfert.desc(), TransfertInterne.date_creation.desc()
    )
    transferts, total, pages = await paginer(session, requete, pagination)
    return await _lectures(session, transferts), total, pages


async def lire_transfert(session: AsyncSession, transfert_id: uuid.UUID) -> TransfertLecture:
    transfert = await session.get(TransfertInterne, transfert_id, populate_existing=True)
    if transfert is None:
        raise ErreurMetier(
            "TRANSFERT_INTROUVABLE", "Ce transfert n'existe pas.", status.HTTP_404_NOT_FOUND
        )
    return (await _lectures(session, [transfert]))[0]


async def _par_cle(session: AsyncSession, cle: uuid.UUID) -> uuid.UUID | None:
    return await session.scalar(
        select(TransfertInterne.id).where(TransfertInterne.cle_idempotence == cle)
    )


async def creer_transfert(
    session: AsyncSession, donnees: TransfertCreation, auteur: Utilisateur
) -> tuple[TransfertLecture, bool]:
    existant = await _par_cle(session, donnees.cle_idempotence)
    if existant is not None:
        return await lire_transfert(session, existant), False
    jour = date_passee(donnees.date_transfert, "date_transfert")
    # Les deux comptes verrouillés ensemble, par identifiant croissant
    comptes = await verrouiller_comptes(
        session, {donnees.compte_source_id, donnees.compte_destination_id}
    )
    source = comptes[donnees.compte_source_id]
    destination = comptes[donnees.compte_destination_id]

    transfert = TransfertInterne(
        numero=await prochain_numero(session, "TRF", jour),
        compte_source_id=source.id,
        compte_destination_id=destination.id,
        montant=donnees.montant,
        date_transfert=jour,
        libelle=(donnees.libelle or "").strip() or None,
        reference_paiement=(donnees.reference_paiement or "").strip() or None,
        cree_par=auteur.id,
        cle_idempotence=donnees.cle_idempotence,
    )
    session.add(transfert)
    await session.flush()
    libelle = f"Transfert {transfert.numero} : {source.nom} → {destination.nom}"[:255]
    # La source d'abord : refusé si une caisse ou un compte Mobile Money n'a pas l'argent
    await ecrire_mouvement_tresorerie(
        session,
        source,
        type_flux=TypeFluxTresorerie.TRANSFERT_INTERNE,
        sens="DEBIT",
        montant=donnees.montant,
        libelle=libelle,
        utilisateur_id=auteur.id,
        transfert_id=transfert.id,
    )
    await ecrire_mouvement_tresorerie(
        session,
        destination,
        type_flux=TypeFluxTresorerie.TRANSFERT_INTERNE,
        sens="CREDIT",
        montant=donnees.montant,
        libelle=libelle,
        utilisateur_id=auteur.id,
        transfert_id=transfert.id,
    )
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        existant = await _par_cle(session, donnees.cle_idempotence)
        if existant is None:
            raise
        return await lire_transfert(session, existant), False
    return await lire_transfert(session, transfert.id), True
