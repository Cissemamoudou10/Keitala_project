import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependances import ACCES_METIER
from app.db.session import get_db
from app.schemas.common import PageReponse, PaginationParams
from app.schemas.tiers import TiersCreation, TiersLecture, TiersModification, TypeTiers
from app.services import tiers as service

# Saisie : Super Admin et Gestionnaire ; le Consultant lit (ACCES_METIER)
router = APIRouter(prefix="/tiers", tags=["Tiers"], dependencies=ACCES_METIER)

Session = Annotated[AsyncSession, Depends(get_db)]


@router.get("", summary="Clients et fournisseurs, avec créance et dette")
async def lister(
    session: Session,
    pagination: Annotated[PaginationParams, Depends()],
    type: TypeTiers | None = None,  # noqa: A002 (nom du paramètre d'adresse)
    recherche: Annotated[str | None, Query(max_length=100)] = None,
    inclure_inactifs: bool = False,
) -> PageReponse[TiersLecture]:
    tiers, total, pages = await service.lister_tiers(
        session,
        pagination,
        type_tiers=type,
        recherche=recherche,
        inclure_inactifs=inclure_inactifs,
    )
    return PageReponse(
        items=tiers,
        total=total,
        page=pagination.page,
        taille=pagination.taille,
        pages_total=pages,
    )


@router.post("", status_code=status.HTTP_201_CREATED, summary="Création d'un client ou fournisseur")
async def creer(donnees: TiersCreation, session: Session) -> TiersLecture:
    return await service.creer_tiers(session, donnees)


@router.get("/{tiers_id}", summary="Fiche d'un client ou fournisseur")
async def obtenir(tiers_id: uuid.UUID, session: Session) -> TiersLecture:
    return await service.lire_tiers(session, tiers_id)


@router.put("/{tiers_id}", summary="Modification")
async def modifier(
    tiers_id: uuid.UUID, donnees: TiersModification, session: Session
) -> TiersLecture:
    return await service.modifier_tiers(session, tiers_id, donnees)
