"""Connexion et rafraîchissement de session (US-AUTH-01)."""

from datetime import UTC, datetime

from fastapi import status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.erreurs import ErreurMetier
from app.core.security import (
    EMPREINTE_FICTIVE,
    JetonInvalide,
    TypeJeton,
    creer_jeton_acces,
    creer_jeton_rafraichissement,
    decoder_jeton,
    verifier_mot_de_passe,
    version_mot_de_passe,
)
from app.models import Utilisateur
from app.schemas.auth import Jetons
from app.schemas.utilisateurs import UtilisateurLecture


# Une instance neuve à chaque levée (une exception réutilisée accumule ses traces)
def identifiants_invalides() -> ErreurMetier:
    return ErreurMetier(
        "IDENTIFIANTS_INVALIDES",
        "Email ou mot de passe incorrect. Vérifiez votre saisie et réessayez.",
        status.HTTP_401_UNAUTHORIZED,
    )


def compte_desactive() -> ErreurMetier:
    return ErreurMetier(
        "COMPTE_DESACTIVE",
        "Ce compte est désactivé. Contactez l'administrateur.",
        status.HTTP_403_FORBIDDEN,
    )


def session_expiree() -> ErreurMetier:
    return ErreurMetier(
        "SESSION_EXPIREE",
        "Votre session a expiré. Reconnectez-vous.",
        status.HTTP_401_UNAUTHORIZED,
    )


def _jetons_pour(utilisateur: Utilisateur) -> Jetons:
    return Jetons(
        jeton_acces=creer_jeton_acces(utilisateur.id, utilisateur.mot_de_passe_hash),
        jeton_rafraichissement=creer_jeton_rafraichissement(
            utilisateur.id, utilisateur.mot_de_passe_hash
        ),
        duree_acces=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        duree_rafraichissement=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600,
        utilisateur=UtilisateurLecture.model_validate(utilisateur),
    )


async def connecter(session: AsyncSession, email: str, mot_de_passe: str) -> Jetons:
    utilisateur = (
        await session.execute(
            select(Utilisateur).where(func.lower(Utilisateur.email) == email.strip().lower())
        )
    ).scalar_one_or_none()

    # Toujours vérifier un mot de passe, même sans compte : même durée de réponse
    empreinte = utilisateur.mot_de_passe_hash if utilisateur else EMPREINTE_FICTIVE
    mot_de_passe_correct = verifier_mot_de_passe(mot_de_passe, empreinte)
    if utilisateur is None or not mot_de_passe_correct:
        raise identifiants_invalides()
    # Indiqué seulement après un mot de passe correct : n'aide pas à deviner les comptes
    if not utilisateur.est_actif:
        raise compte_desactive()

    utilisateur.derniere_connexion = datetime.now(UTC)
    await session.commit()
    await session.refresh(utilisateur)
    return _jetons_pour(utilisateur)


async def utilisateur_du_jeton(
    session: AsyncSession, jeton: str, type_jeton: TypeJeton
) -> Utilisateur:
    """Utilisateur actif désigné par un jeton valide, sinon `session_expiree()`.

    L'utilisateur est relu en base à chaque appel : une désactivation, un changement de
    rôle ou une réinitialisation du mot de passe prennent effet immédiatement.
    """
    try:
        utilisateur_id, version = decoder_jeton(jeton, type_jeton)
    except JetonInvalide as erreur:
        raise session_expiree() from erreur
    utilisateur = await session.get(Utilisateur, utilisateur_id)
    if (
        utilisateur is None
        or not utilisateur.est_actif
        or version_mot_de_passe(utilisateur.mot_de_passe_hash) != version
    ):
        raise session_expiree()
    return utilisateur


async def rafraichir(session: AsyncSession, jeton_rafraichissement: str) -> Jetons:
    utilisateur = await utilisateur_du_jeton(
        session, jeton_rafraichissement, TypeJeton.RAFRAICHISSEMENT
    )
    return _jetons_pour(utilisateur)
