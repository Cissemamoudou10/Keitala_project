import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependances import ACCES_METIER, exiger_roles
from app.db.session import get_db
from app.models import Utilisateur
from app.models.enums import RoleUtilisateur
from app.schemas.achats import (
    AchatCreation,
    AchatDetail,
    AchatResume,
    Annulation,
    PaiementCreation,
)
from app.schemas.common import PageReponse, PaginationParams
from app.services import achats as service

router = APIRouter(prefix="/achats", tags=["Achats"], dependencies=ACCES_METIER)

Session = Annotated[AsyncSession, Depends(get_db)]
# Matrice des droits : achats saisis, réglés et annulés par le Gestionnaire ; le Super
# Admin et le Consultant consultent.
Gestionnaire = Annotated[Utilisateur, Depends(exiger_roles(RoleUtilisateur.GESTIONNAIRE))]


@router.get("", summary="Liste des achats avec reste à payer")
async def lister(
    session: Session,
    pagination: Annotated[PaginationParams, Depends()],
    fournisseur_id: uuid.UUID | None = None,
    du: date | None = None,
    au: date | None = None,
    a_payer: bool = False,
    recherche: Annotated[str | None, Query(max_length=100)] = None,
) -> PageReponse[AchatResume]:
    achats, total, pages = await service.lister_achats(
        session,
        pagination,
        fournisseur_id=fournisseur_id,
        du=du,
        au=au,
        a_payer=a_payer,
        recherche=recherche,
    )
    return PageReponse(
        items=achats, total=total, page=pagination.page, taille=pagination.taille, pages_total=pages
    )


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Enregistrement d'un achat (stock, coût moyen, règlements)",
    responses={200: {"description": "Achat déjà enregistré avec cette clé (nouvel envoi)"}},
)
async def creer(
    donnees: AchatCreation, session: Session, auteur: Gestionnaire, response: Response
) -> AchatDetail:
    achat, cree = await service.creer_achat(session, donnees, auteur)
    if not cree:
        response.status_code = status.HTTP_200_OK
    return achat


@router.get("/{achat_id}", summary="Détail d'un achat")
async def obtenir(achat_id: uuid.UUID, session: Session) -> AchatDetail:
    return await service.lire_achat(session, achat_id)


@router.post("/{achat_id}/reglements", summary="Paiement ultérieur d'une dette fournisseur")
async def payer(
    achat_id: uuid.UUID, donnees: PaiementCreation, session: Session, auteur: Gestionnaire
) -> AchatDetail:
    return await service.payer_achat(session, achat_id, donnees, auteur)


@router.post("/{achat_id}/annuler", summary="Annulation avec contre-passation")
async def annuler(
    achat_id: uuid.UUID, donnees: Annulation, session: Session, auteur: Gestionnaire
) -> AchatDetail:
    return await service.annuler_achat(session, achat_id, donnees.motif, auteur)
