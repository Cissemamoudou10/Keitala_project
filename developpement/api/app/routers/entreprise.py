from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import settings
from app.core.dependances import ACCES_METIER

router = APIRouter(prefix="/entreprise", tags=["Entreprise"], dependencies=ACCES_METIER)


class Entreprise(BaseModel):
    nom: str
    adresse: str
    telephone: str
    identifiants: str
    mentions: str


@router.get("", summary="Coordonnées de l'entreprise, pour l'en-tête des factures")
async def lire() -> Entreprise:
    return Entreprise(
        nom=settings.ENTREPRISE_NOM,
        adresse=settings.ENTREPRISE_ADRESSE,
        telephone=settings.ENTREPRISE_TELEPHONE,
        identifiants=settings.ENTREPRISE_IDENTIFIANTS,
        mentions=settings.ENTREPRISE_MENTIONS,
    )
