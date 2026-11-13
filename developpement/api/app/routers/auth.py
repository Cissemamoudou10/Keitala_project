from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependances import UtilisateurCourant
from app.db.session import get_db
from app.schemas.auth import DemandeRafraichissement, Identifiants, Jetons
from app.schemas.utilisateurs import UtilisateurLecture
from app.services import auth as service

# Appelé par le proxy Next.js seulement : le navigateur ne voit jamais les jetons,
# qui sont posés en cookies HttpOnly (conception technique, section 2).
router = APIRouter(prefix="/auth", tags=["Authentification"])

Session = Annotated[AsyncSession, Depends(get_db)]


@router.post("/login", summary="Connexion par email et mot de passe")
async def connexion(identifiants: Identifiants, session: Session) -> Jetons:
    return await service.connecter(session, identifiants.email, identifiants.mot_de_passe)


@router.post("/refresh", summary="Nouveaux jetons à partir du jeton de rafraîchissement")
async def rafraichissement(demande: DemandeRafraichissement, session: Session) -> Jetons:
    return await service.rafraichir(session, demande.jeton_rafraichissement)


@router.get("/me", summary="Profil de l'utilisateur connecté")
async def profil(utilisateur: UtilisateurCourant) -> UtilisateurLecture:
    return UtilisateurLecture.model_validate(utilisateur)
