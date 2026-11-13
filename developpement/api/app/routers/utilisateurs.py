import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependances import ACCES_METIER, exiger_roles
from app.db.session import get_db
from app.models import Utilisateur
from app.models.enums import RoleUtilisateur
from app.schemas.common import PageReponse, PaginationParams
from app.schemas.utilisateurs import (
    UtilisateurCreation,
    UtilisateurLecture,
    UtilisateurModification,
)
from app.services import utilisateurs as service

# Gestion des comptes : Super Admin uniquement (US-AUTH-02, matrice des droits)
router = APIRouter(
    prefix="/utilisateurs",
    tags=["Utilisateurs"],
    dependencies=[*ACCES_METIER, Depends(exiger_roles(RoleUtilisateur.SUPER_ADMIN))],
)

Session = Annotated[AsyncSession, Depends(get_db)]
SuperAdmin = Annotated[Utilisateur, Depends(exiger_roles(RoleUtilisateur.SUPER_ADMIN))]


@router.get("", summary="Liste des comptes")
async def lister(
    session: Session, pagination: Annotated[PaginationParams, Depends()]
) -> PageReponse[UtilisateurLecture]:
    utilisateurs, total, pages = await service.lister_utilisateurs(session, pagination)
    return PageReponse(
        items=[UtilisateurLecture.model_validate(u) for u in utilisateurs],
        total=total,
        page=pagination.page,
        taille=pagination.taille,
        pages_total=pages,
    )


@router.post("", status_code=status.HTTP_201_CREATED, summary="Création d'un compte")
async def creer(donnees: UtilisateurCreation, session: Session) -> UtilisateurLecture:
    return UtilisateurLecture.model_validate(await service.creer_utilisateur(session, donnees))


@router.get("/{utilisateur_id}", summary="Fiche d'un compte")
async def obtenir(utilisateur_id: uuid.UUID, session: Session) -> UtilisateurLecture:
    return UtilisateurLecture.model_validate(
        await service.obtenir_utilisateur(session, utilisateur_id)
    )


@router.put(
    "/{utilisateur_id}",
    summary="Modification, activation ou réinitialisation du mot de passe",
)
async def modifier(
    utilisateur_id: uuid.UUID,
    donnees: UtilisateurModification,
    session: Session,
    auteur: SuperAdmin,
) -> UtilisateurLecture:
    utilisateur = await service.modifier_utilisateur(session, utilisateur_id, donnees, auteur)
    return UtilisateurLecture.model_validate(utilisateur)
