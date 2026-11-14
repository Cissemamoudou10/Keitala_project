import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependances import ACCES_METIER, UtilisateurCourant
from app.db.session import get_db
from app.models.enums import FamilleArticle
from app.schemas.articles import (
    ArticleCreation,
    ArticleLecture,
    ArticleModification,
    UnitesArticle,
)
from app.schemas.common import PageReponse, PaginationParams
from app.services import articles as service

# Créer et modifier : Super Admin et Gestionnaire ; le Consultant lit (ACCES_METIER)
router = APIRouter(prefix="/articles", tags=["Articles"], dependencies=ACCES_METIER)

Session = Annotated[AsyncSession, Depends(get_db)]


@router.get("", summary="Catalogue filtrable (famille, recherche)")
async def lister(
    session: Session,
    pagination: Annotated[PaginationParams, Depends()],
    famille: FamilleArticle | None = None,
    recherche: Annotated[str | None, Query(max_length=100)] = None,
    inclure_inactifs: bool = False,
    sous_seuil: bool = False,
) -> PageReponse[ArticleLecture]:
    articles, total, pages = await service.lister_articles(
        session,
        pagination,
        famille=famille,
        recherche=recherche,
        inclure_inactifs=inclure_inactifs,
        sous_seuil=sous_seuil,
    )
    return PageReponse(
        items=[ArticleLecture.model_validate(a) for a in articles],
        total=total,
        page=pagination.page,
        taille=pagination.taille,
        pages_total=pages,
    )


@router.get("/familles", summary="Nombre d'articles actifs par famille")
async def familles(session: Session) -> dict[FamilleArticle, int]:
    comptes = await service.compter_par_famille(session)
    return {famille: comptes.get(famille, 0) for famille in FamilleArticle}


@router.post("", status_code=status.HTTP_201_CREATED, summary="Création d'un article")
async def creer(
    donnees: ArticleCreation, session: Session, utilisateur: UtilisateurCourant
) -> ArticleLecture:
    return ArticleLecture.model_validate(await service.creer_article(session, donnees, utilisateur))


@router.get("/{article_id}", summary="Fiche d'un article et ses unités")
async def obtenir(article_id: uuid.UUID, session: Session) -> ArticleLecture:
    return ArticleLecture.model_validate(await service.obtenir_article(session, article_id))


@router.put("/{article_id}", summary="Modification (désignation, prix, seuil, statut…)")
async def modifier(
    article_id: uuid.UUID,
    donnees: ArticleModification,
    session: Session,
    utilisateur: UtilisateurCourant,
) -> ArticleLecture:
    return ArticleLecture.model_validate(
        await service.modifier_article(session, article_id, donnees, utilisateur)
    )


@router.put("/{article_id}/unites", summary="Unités de saisie et facteurs de conversion")
async def definir_unites(
    article_id: uuid.UUID, donnees: UnitesArticle, session: Session
) -> ArticleLecture:
    return ArticleLecture.model_validate(await service.definir_unites(session, article_id, donnees))
