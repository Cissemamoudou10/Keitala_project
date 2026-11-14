import uuid
from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependances import ACCES_METIER, exiger_roles
from app.db.session import get_db
from app.models import MouvementStock, Utilisateur
from app.models.enums import RoleUtilisateur, TypeMouvementStock
from app.schemas.articles import ArticleLecture
from app.schemas.common import PageReponse, PaginationParams
from app.schemas.stocks import (
    ArticleResume,
    Comptage,
    EtatGlobal,
    InventaireDetail,
    InventaireOuverture,
    InventaireResume,
    MouvementLecture,
    PerteCreation,
    SyntheseFamille,
)
from app.services import articles as service_articles
from app.services import inventaires as service_inventaires
from app.services import stocks as service

router = APIRouter(prefix="/stocks", tags=["Stocks"], dependencies=ACCES_METIER)

Session = Annotated[AsyncSession, Depends(get_db)]
Pagination = Annotated[PaginationParams, Depends()]
# Matrice des droits : inventaires et pertes sont saisis par le Gestionnaire ; le Super
# Admin les contrôle après coup, le Consultant les consulte.
Gestionnaire = Annotated[Utilisateur, Depends(exiger_roles(RoleUtilisateur.GESTIONNAIRE))]


async def _lectures(
    session: AsyncSession, mouvements: list[MouvementStock]
) -> list[MouvementLecture]:
    articles = await service.articles_par_id(session, [m.article_id for m in mouvements])
    auteurs = await service.noms_des_auteurs(session, [m.utilisateur_id for m in mouvements])
    return [
        MouvementLecture(
            id=m.id,
            date_mouvement=m.date_mouvement,
            article=ArticleResume.model_validate(articles[m.article_id], from_attributes=True),
            type_mouvement=m.type_mouvement,
            quantite=m.quantite,
            cout_unitaire=m.cout_unitaire,
            stock_avant=m.stock_avant,
            stock_apres=m.stock_apres,
            reference_document=m.reference_document,
            motif=m.motif,
            auteur=auteurs.get(m.utilisateur_id, ""),
        )
        for m in mouvements
    ]


@router.get("/etat-global", summary="Valeur du stock et articles sous le seuil, par famille")
async def etat_global(session: Session) -> EtatGlobal:
    familles = [
        SyntheseFamille(famille=f, nombre_articles=n, valeur=v, nombre_sous_seuil=a)
        for f, n, v, a in await service.synthese_par_famille(session)
    ]
    return EtatGlobal(
        familles=familles,
        valeur_totale=sum((f.valeur for f in familles), start=Decimal(0)),
        nombre_sous_seuil=sum(f.nombre_sous_seuil for f in familles),
    )


@router.get("/alertes-rupture", summary="Articles sous le seuil minimum")
async def alertes(session: Session, pagination: Pagination) -> PageReponse[ArticleLecture]:
    articles, total, pages = await service_articles.lister_articles(
        session, pagination, sous_seuil=True
    )
    return PageReponse(
        items=[ArticleLecture.model_validate(a) for a in articles],
        total=total,
        page=pagination.page,
        taille=pagination.taille,
        pages_total=pages,
    )


@router.get("/mouvements", summary="Journal des mouvements (filtres article, type, dates)")
async def mouvements(
    session: Session,
    pagination: Pagination,
    article_id: uuid.UUID | None = None,
    type_mouvement: TypeMouvementStock | None = None,
    du: date | None = None,
    au: date | None = None,
) -> PageReponse[MouvementLecture]:
    liste, total, pages = await service.lister_mouvements(
        session, pagination, article_id=article_id, type_mouvement=type_mouvement, du=du, au=au
    )
    return PageReponse(
        items=await _lectures(session, liste),
        total=total,
        page=pagination.page,
        taille=pagination.taille,
        pages_total=pages,
    )


@router.post("/pertes", status_code=status.HTTP_201_CREATED, summary="Sortie pour perte ou avarie")
async def perte(donnees: PerteCreation, session: Session, auteur: Gestionnaire) -> MouvementLecture:
    mouvement = await service.declarer_perte(
        session,
        article_id=donnees.article_id,
        quantite=donnees.quantite,
        unite_id=donnees.unite_id,
        motif=donnees.motif,
        commentaire=donnees.commentaire,
        auteur=auteur,
    )
    return (await _lectures(session, [mouvement]))[0]


@router.get("/inventaires", summary="Liste des inventaires")
async def inventaires(session: Session, pagination: Pagination) -> PageReponse[InventaireResume]:
    liste, total, pages = await service_inventaires.lister_inventaires(session, pagination)
    return PageReponse(
        items=liste, total=total, page=pagination.page, taille=pagination.taille, pages_total=pages
    )


@router.post(
    "/inventaires",
    status_code=status.HTTP_201_CREATED,
    summary="Ouverture d'un inventaire (fige le stock théorique)",
)
async def ouvrir(
    donnees: InventaireOuverture, session: Session, auteur: Gestionnaire
) -> InventaireDetail:
    return await service_inventaires.ouvrir_inventaire(
        session, donnees.famille, donnees.observations, auteur
    )


@router.get("/inventaires/{inventaire_id}", summary="Inventaire et ses lignes")
async def inventaire(inventaire_id: uuid.UUID, session: Session) -> InventaireDetail:
    return await service_inventaires.lire_inventaire(session, inventaire_id)


@router.put("/inventaires/{inventaire_id}", summary="Saisie des quantités comptées et des motifs")
async def comptage(
    inventaire_id: uuid.UUID, donnees: Comptage, session: Session, _auteur: Gestionnaire
) -> InventaireDetail:
    return await service_inventaires.saisir_comptage(session, inventaire_id, donnees)


@router.post("/inventaires/{inventaire_id}/valider", summary="Génère les ajustements de stock")
async def valider(
    inventaire_id: uuid.UUID, session: Session, auteur: Gestionnaire
) -> InventaireDetail:
    return await service_inventaires.valider_inventaire(session, inventaire_id, auteur)
