import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependances import ACCES_METIER, exiger_roles
from app.db.session import get_db
from app.models import Utilisateur
from app.models.enums import RoleUtilisateur, StatutOf, TypeOf
from app.schemas.common import PageReponse, PaginationParams
from app.schemas.production import (
    AnnulationOrdre,
    Cloture,
    OrdreCreation,
    OrdreDetail,
    OrdreResume,
    RecetteLecture,
    RecetteModification,
    RecetteSaisie,
    SortieCreation,
)
from app.services import production as service

# Matrice des droits : recettes créées et modifiées par le Super Admin et le Gestionnaire
# (le Consultant est refusé par ACCES_METIER) ; ordres lancés, déclarés et clôturés par le
# Gestionnaire seul.
router = APIRouter(prefix="/production", tags=["Production"], dependencies=ACCES_METIER)

Session = Annotated[AsyncSession, Depends(get_db)]
Gestionnaire = Annotated[Utilisateur, Depends(exiger_roles(RoleUtilisateur.GESTIONNAIRE))]


@router.get("/recettes", summary="Recettes de transformation et de conditionnement")
async def lister_recettes(
    session: Session, type_of: TypeOf | None = None, actives: bool = True
) -> list[RecetteLecture]:
    return await service.lister_recettes(session, type_of=type_of, actives=actives)


@router.post("/recettes", status_code=status.HTTP_201_CREATED, summary="Création d'une recette")
async def creer_recette(donnees: RecetteSaisie, session: Session) -> RecetteLecture:
    return await service.creer_recette(session, donnees)


@router.get("/recettes/{recette_id}", summary="Détail d'une recette")
async def lire_recette(recette_id: uuid.UUID, session: Session) -> RecetteLecture:
    return await service.lire_recette(session, recette_id)


@router.put("/recettes/{recette_id}", summary="Modification d'une recette")
async def modifier_recette(
    recette_id: uuid.UUID, donnees: RecetteModification, session: Session
) -> RecetteLecture:
    return await service.modifier_recette(session, recette_id, donnees)


@router.get("/ordres", summary="Ordres de fabrication")
async def lister_ordres(
    session: Session,
    pagination: Annotated[PaginationParams, Depends()],
    statut: StatutOf | None = None,
    type_of: TypeOf | None = None,
) -> PageReponse[OrdreResume]:
    ordres, total, pages = await service.lister_ordres(
        session, pagination, statut=statut, type_of=type_of
    )
    return PageReponse(
        items=ordres, total=total, page=pagination.page, taille=pagination.taille, pages_total=pages
    )


@router.post(
    "/ordres",
    status_code=status.HTTP_201_CREATED,
    summary="Lancement d'un ordre (besoins calculés, alerte si un composant manque)",
)
async def lancer_ordre(
    donnees: OrdreCreation, session: Session, auteur: Gestionnaire
) -> OrdreDetail:
    return await service.lancer_ordre(session, donnees, auteur)


@router.get("/ordres/{ordre_id}", summary="Détail d'un ordre de fabrication")
async def lire_ordre(ordre_id: uuid.UUID, session: Session) -> OrdreDetail:
    return await service.lire_ordre(session, ordre_id)


@router.post("/ordres/{ordre_id}/sorties", summary="Déclaration d'une sortie de production")
async def declarer_sortie(
    ordre_id: uuid.UUID, donnees: SortieCreation, session: Session, _auteur: Gestionnaire
) -> OrdreDetail:
    return await service.declarer_sortie(session, ordre_id, donnees)


@router.post(
    "/ordres/{ordre_id}/sorties/{sortie_id}/retirer",
    summary="Retrait d'une sortie déclarée par erreur (ordre en cours)",
)
async def retirer_sortie(
    ordre_id: uuid.UUID, sortie_id: int, session: Session, _auteur: Gestionnaire
) -> OrdreDetail:
    return await service.retirer_sortie(session, ordre_id, sortie_id)


@router.post("/ordres/{ordre_id}/cloturer", summary="Clôture : déstockage, entrée, coût de revient")
async def cloturer_ordre(
    ordre_id: uuid.UUID, donnees: Cloture, session: Session, auteur: Gestionnaire
) -> OrdreDetail:
    return await service.cloturer_ordre(session, ordre_id, donnees, auteur)


@router.post("/ordres/{ordre_id}/annuler", summary="Annulation d'un ordre en cours")
async def annuler_ordre(
    ordre_id: uuid.UUID, donnees: AnnulationOrdre, session: Session, auteur: Gestionnaire
) -> OrdreDetail:
    return await service.annuler_ordre(session, ordre_id, donnees.motif, auteur)
