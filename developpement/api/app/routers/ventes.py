import uuid
from datetime import date
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependances import ACCES_METIER, exiger_roles
from app.db.session import get_db
from app.models import Utilisateur
from app.models.enums import RoleUtilisateur
from app.schemas.common import PageReponse, PaginationParams
from app.schemas.pieces import Annulation, PaiementCreation
from app.schemas.ventes import DonCreation, VenteCreation, VenteDetail, VenteResume
from app.services import ventes as service

router = APIRouter(prefix="/ventes", tags=["Ventes"], dependencies=ACCES_METIER)

Session = Annotated[AsyncSession, Depends(get_db)]
# Matrice des droits : ventes, dons, encaissements et annulations saisis par le
# Gestionnaire ; le Super Admin et le Consultant consultent.
Gestionnaire = Annotated[Utilisateur, Depends(exiger_roles(RoleUtilisateur.GESTIONNAIRE))]
DEJA_ENREGISTRE: dict[int | str, dict[str, Any]] = {
    200: {"description": "Pièce déjà enregistrée avec cette clé (nouvel envoi)"}
}


@router.get("", summary="Liste des ventes et des dons, avec reste à payer")
async def lister(
    session: Session,
    pagination: Annotated[PaginationParams, Depends()],
    type: Literal["ventes", "dons"] | None = None,  # noqa: A002 (nom du paramètre d'adresse)
    client_id: uuid.UUID | None = None,
    du: date | None = None,
    au: date | None = None,
    a_encaisser: bool = False,
    recherche: Annotated[str | None, Query(max_length=100)] = None,
) -> PageReponse[VenteResume]:
    ventes, total, pages = await service.lister_ventes(
        session,
        pagination,
        type_piece=type,
        client_id=client_id,
        du=du,
        au=au,
        a_encaisser=a_encaisser,
        recherche=recherche,
    )
    return PageReponse(
        items=ventes, total=total, page=pagination.page, taille=pagination.taille, pages_total=pages
    )


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Vente (déstockage, encaissements éventuels)",
    responses=DEJA_ENREGISTRE,
)
async def creer(
    donnees: VenteCreation, session: Session, auteur: Gestionnaire, response: Response
) -> VenteDetail:
    vente, creee = await service.creer_vente(session, donnees, auteur)
    if not creee:
        response.status_code = status.HTTP_200_OK
    return vente


@router.post(
    "/dons",
    status_code=status.HTTP_201_CREATED,
    summary="Don ou échantillon (stock sorti, montant nul)",
    responses=DEJA_ENREGISTRE,
)
async def donner(
    donnees: DonCreation, session: Session, auteur: Gestionnaire, response: Response
) -> VenteDetail:
    don, cree = await service.creer_don(session, donnees, auteur)
    if not cree:
        response.status_code = status.HTTP_200_OK
    return don


@router.get("/{vente_id}", summary="Détail d'une vente ou d'un don (sert aussi à la facture)")
async def obtenir(vente_id: uuid.UUID, session: Session) -> VenteDetail:
    return await service.lire_vente(session, vente_id)


@router.post("/{vente_id}/reglements", summary="Encaissement ultérieur d'une créance client")
async def encaisser(
    vente_id: uuid.UUID, donnees: PaiementCreation, session: Session, auteur: Gestionnaire
) -> VenteDetail:
    return await service.encaisser_vente(session, vente_id, donnees, auteur)


@router.post("/{vente_id}/annuler", summary="Annulation avec contre-passation")
async def annuler(
    vente_id: uuid.UUID, donnees: Annulation, session: Session, auteur: Gestionnaire
) -> VenteDetail:
    return await service.annuler_vente(session, vente_id, donnees.motif, auteur)
