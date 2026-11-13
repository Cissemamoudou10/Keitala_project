"""Contrôle d'accès de l'API (AGENTS.md, règle 9 ; US-AUTH-03).

Chaque routeur métier se déclare avec `dependencies=ACCES_METIER` : toute requête
exige une session valide, et toute écriture d'un CONSULTANT est refusée (403).
Les routes réservées ajoutent `Depends(exiger_roles(...))`.
"""

from collections.abc import Callable, Coroutine
from typing import Annotated, Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import TypeJeton
from app.db.session import get_db
from app.models import Utilisateur
from app.models.enums import RoleUtilisateur
from app.services.auth import utilisateur_du_jeton

_porteur = HTTPBearer(auto_error=False)

METHODES_DE_LECTURE = frozenset({"GET", "HEAD", "OPTIONS"})


async def utilisateur_courant(
    identifiants: Annotated[HTTPAuthorizationCredentials | None, Depends(_porteur)],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> Utilisateur:
    if identifiants is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, headers={"WWW-Authenticate": "Bearer"})
    return await utilisateur_du_jeton(session, identifiants.credentials, TypeJeton.ACCES)


UtilisateurCourant = Annotated[Utilisateur, Depends(utilisateur_courant)]


async def refuser_ecriture_consultant(request: Request, utilisateur: UtilisateurCourant) -> None:
    if utilisateur.role == RoleUtilisateur.CONSULTANT and request.method not in METHODES_DE_LECTURE:
        raise HTTPException(status.HTTP_403_FORBIDDEN)


def exiger_roles(
    *roles: RoleUtilisateur,
) -> Callable[[Utilisateur], Coroutine[Any, Any, Utilisateur]]:
    async def verifier(utilisateur: UtilisateurCourant) -> Utilisateur:
        if utilisateur.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN)
        return utilisateur

    return verifier


# À poser sur tout routeur métier
ACCES_METIER = [Depends(refuser_ecriture_consultant)]
