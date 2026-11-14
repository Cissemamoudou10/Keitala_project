from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependances import ACCES_METIER, exiger_roles
from app.db.session import get_db
from app.models import Utilisateur
from app.models.enums import RoleUtilisateur
from app.schemas.tresorerie import (
    CompteCreation,
    CompteLecture,
    CompteModification,
    SoldeOuverture,
)
from app.services import tresorerie as service

# Comptes : consultés par tous, paramétrés par le Super Admin (matrice des droits)
router = APIRouter(prefix="/tresorerie", tags=["Trésorerie"], dependencies=ACCES_METIER)

Session = Annotated[AsyncSession, Depends(get_db)]
SuperAdmin = Annotated[Utilisateur, Depends(exiger_roles(RoleUtilisateur.SUPER_ADMIN))]


@router.get("/comptes", summary="Comptes et soldes")
async def lister_comptes(session: Session) -> list[CompteLecture]:
    return await service.lister_comptes(session)


@router.post(
    "/comptes", status_code=status.HTTP_201_CREATED, summary="Ajout d'un compte (Super Admin)"
)
async def creer_compte(
    donnees: CompteCreation, session: Session, _admin: SuperAdmin
) -> CompteLecture:
    return await service.creer_compte(session, donnees)


@router.put("/comptes/{compte_id}", summary="Renommer, activer ou désactiver (Super Admin)")
async def modifier_compte(
    compte_id: int, donnees: CompteModification, session: Session, _admin: SuperAdmin
) -> CompteLecture:
    return await service.modifier_compte(session, compte_id, donnees)


@router.post(
    "/comptes/{compte_id}/solde-ouverture",
    summary="Solde d'ouverture, saisi une seule fois (Super Admin)",
)
async def saisir_solde_ouverture(
    compte_id: int, donnees: SoldeOuverture, session: Session, admin: SuperAdmin
) -> CompteLecture:
    return await service.saisir_solde_ouverture(session, compte_id, donnees.montant, admin.id)
