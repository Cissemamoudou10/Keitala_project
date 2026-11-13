"""Mots de passe et jetons JWT (US-AUTH-01)."""

import hashlib
import uuid
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Any

import jwt
from pwdlib import PasswordHash

from app.core.config import settings

_hacheur = PasswordHash.recommended()

# Empreinte d'un mot de passe fictif : vérifiée quand l'email est inconnu, pour que la
# réponse prenne le même temps qu'avec un compte existant (pas d'indice sur les comptes).
EMPREINTE_FICTIVE = _hacheur.hash("mot-de-passe-fictif-pour-temps-constant")


class TypeJeton(StrEnum):
    ACCES = "acces"
    RAFRAICHISSEMENT = "rafraichissement"


class JetonInvalide(Exception):
    """Jeton absent, expiré, falsifié ou d'un autre type que celui attendu."""


def hacher_mot_de_passe(mot_de_passe: str) -> str:
    return _hacheur.hash(mot_de_passe)


def verifier_mot_de_passe(mot_de_passe: str, empreinte: str) -> bool:
    return _hacheur.verify(mot_de_passe, empreinte)


def version_mot_de_passe(mot_de_passe_hash: str) -> str:
    """Courte empreinte du hash, portée par les jetons.

    Changer le mot de passe change cette valeur : les jetons émis avant deviennent
    invalides, sans table de révocation.
    """
    return hashlib.sha256(mot_de_passe_hash.encode()).hexdigest()[:16]


def _encoder(sujet: uuid.UUID, type_jeton: TypeJeton, version: str, duree: timedelta) -> str:
    maintenant = datetime.now(UTC)
    contenu: dict[str, Any] = {
        "sub": str(sujet),
        "typ": type_jeton.value,
        "pv": version,
        "iat": maintenant,
        "exp": maintenant + duree,
    }
    return jwt.encode(contenu, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def creer_jeton_acces(utilisateur_id: uuid.UUID, mot_de_passe_hash: str) -> str:
    return _encoder(
        utilisateur_id,
        TypeJeton.ACCES,
        version_mot_de_passe(mot_de_passe_hash),
        timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )


def creer_jeton_rafraichissement(utilisateur_id: uuid.UUID, mot_de_passe_hash: str) -> str:
    return _encoder(
        utilisateur_id,
        TypeJeton.RAFRAICHISSEMENT,
        version_mot_de_passe(mot_de_passe_hash),
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )


def decoder_jeton(jeton: str, type_attendu: TypeJeton) -> tuple[uuid.UUID, str]:
    """Renvoie (identifiant de l'utilisateur, version du mot de passe)."""
    try:
        contenu = jwt.decode(
            jeton,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"require": ["sub", "typ", "pv", "exp"]},
        )
        if contenu["typ"] != type_attendu.value:
            raise JetonInvalide
        return uuid.UUID(contenu["sub"]), str(contenu["pv"])
    except (jwt.PyJWTError, ValueError, KeyError) as erreur:
        raise JetonInvalide from erreur
