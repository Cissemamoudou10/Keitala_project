import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependances import ACCES_METIER, exiger_roles
from app.db.session import get_db
from app.models import Utilisateur
from app.models.enums import RoleUtilisateur
from app.schemas.depenses import NombreAControler, PieceAControler, TypeControle
from app.services import controles as service

# Contrôle a posteriori : Super Admin seulement (matrice des droits, règle 9)
router = APIRouter(
    prefix="/controles",
    tags=["Contrôles"],
    dependencies=[*ACCES_METIER, Depends(exiger_roles(RoleUtilisateur.SUPER_ADMIN))],
)

Session = Annotated[AsyncSession, Depends(get_db)]
SuperAdmin = Annotated[Utilisateur, Depends(exiger_roles(RoleUtilisateur.SUPER_ADMIN))]


@router.get("/a-controler", summary="Dépenses, transferts, inventaires et clôtures à contrôler")
async def lister(session: Session, type: TypeControle | None = None) -> list[PieceAControler]:  # noqa: A002
    return await service.lister(session, type)


@router.get("/nombre", summary="Nombre de pièces à contrôler (tableau de bord)")
async def compter(session: Session) -> NombreAControler:
    return await service.compter(session)


@router.post(
    "/{type_piece}/{piece_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Marquer une pièce comme contrôlée",
)
async def marquer(
    type_piece: TypeControle, piece_id: uuid.UUID, session: Session, admin: SuperAdmin
) -> None:
    await service.marquer(session, type_piece, piece_id, admin)
