import logging

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sante", tags=["Santé"])


class SanteReponse(BaseModel):
    statut: str
    base_de_donnees: str


@router.get("", summary="État de l'API et de la base de données")
async def verifier_sante(response: Response, db: AsyncSession = Depends(get_db)) -> SanteReponse:
    try:
        await db.execute(text("SELECT 1"))
    except (SQLAlchemyError, OSError):
        # Le détail reste dans les journaux du serveur, jamais dans la réponse
        logger.exception("Base de données injoignable")
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return SanteReponse(statut="degrade", base_de_donnees="injoignable")
    return SanteReponse(statut="ok", base_de_donnees="connecte")
