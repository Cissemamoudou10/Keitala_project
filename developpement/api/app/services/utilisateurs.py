"""Comptes utilisateurs (US-AUTH-02) et premier Super Admin (S1-T1)."""

import uuid

from fastapi import status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.erreurs import ErreurMetier
from app.core.security import hacher_mot_de_passe
from app.db.pagination import paginer
from app.models import Utilisateur
from app.models.enums import RoleUtilisateur
from app.schemas.common import PaginationParams
from app.schemas.utilisateurs import UtilisateurCreation, UtilisateurModification


def _email_deja_utilise(email: str) -> ErreurMetier:
    return ErreurMetier(
        "EMAIL_DEJA_UTILISE",
        f"L'adresse {email} est déjà utilisée par un autre compte.",
        status.HTTP_409_CONFLICT,
        {"champ": "email"},
    )


async def _email_existe(session: AsyncSession, email: str, sauf: uuid.UUID | None = None) -> bool:
    requete = select(Utilisateur.id).where(func.lower(Utilisateur.email) == email.lower())
    if sauf is not None:
        requete = requete.where(Utilisateur.id != sauf)
    return (await session.execute(requete)).first() is not None


async def lister_utilisateurs(
    session: AsyncSession, pagination: PaginationParams
) -> tuple[list[Utilisateur], int, int]:
    # Actifs d'abord, puis par nom : la liste reste stable d'une page à l'autre
    requete = select(Utilisateur).order_by(
        Utilisateur.est_actif.desc(), Utilisateur.nom_complet, Utilisateur.id
    )
    return await paginer(session, requete, pagination)


async def obtenir_utilisateur(session: AsyncSession, utilisateur_id: uuid.UUID) -> Utilisateur:
    utilisateur = await session.get(Utilisateur, utilisateur_id)
    if utilisateur is None:
        raise ErreurMetier(
            "UTILISATEUR_INTROUVABLE", "Ce compte n'existe pas.", status.HTTP_404_NOT_FOUND
        )
    return utilisateur


async def creer_utilisateur(session: AsyncSession, donnees: UtilisateurCreation) -> Utilisateur:
    if await _email_existe(session, donnees.email):
        raise _email_deja_utilise(donnees.email)
    utilisateur = Utilisateur(
        nom_complet=donnees.nom_complet.strip(),
        email=donnees.email,
        role=donnees.role,
        mot_de_passe_hash=hacher_mot_de_passe(donnees.mot_de_passe),
    )
    session.add(utilisateur)
    try:
        await session.commit()
    except IntegrityError as erreur:  # création simultanée du même email
        await session.rollback()
        raise _email_deja_utilise(donnees.email) from erreur
    await session.refresh(utilisateur)
    return utilisateur


async def _nombre_super_admins_actifs(session: AsyncSession) -> int:
    """Compte les Super Admins actifs en verrouillant leurs lignes.

    Le verrou empêche deux admins de se rétrograder l'un l'autre en même temps : la
    seconde modification attend la première, puis voit qu'il n'en reste qu'un.
    """
    requete = (
        select(Utilisateur.id)
        .where(Utilisateur.role == RoleUtilisateur.SUPER_ADMIN, Utilisateur.est_actif.is_(True))
        .with_for_update()
    )
    return len((await session.execute(requete)).all())


async def modifier_utilisateur(
    session: AsyncSession,
    utilisateur_id: uuid.UUID,
    donnees: UtilisateurModification,
    auteur: Utilisateur,
) -> Utilisateur:
    utilisateur = (
        await session.execute(
            select(Utilisateur).where(Utilisateur.id == utilisateur_id).with_for_update()
        )
    ).scalar_one_or_none()
    if utilisateur is None:
        raise ErreurMetier(
            "UTILISATEUR_INTROUVABLE", "Ce compte n'existe pas.", status.HTTP_404_NOT_FOUND
        )

    perd_le_role_admin = (
        utilisateur.role == RoleUtilisateur.SUPER_ADMIN
        and utilisateur.est_actif
        and (
            (donnees.role is not None and donnees.role != RoleUtilisateur.SUPER_ADMIN)
            or donnees.est_actif is False
        )
    )
    if perd_le_role_admin:
        if utilisateur.id == auteur.id:
            raise ErreurMetier(
                "MODIFICATION_DE_SOI_INTERDITE",
                "Vous ne pouvez pas retirer vos propres droits d'administration "
                "ni désactiver votre propre compte.",
            )
        if await _nombre_super_admins_actifs(session) <= 1:
            raise ErreurMetier(
                "DERNIER_SUPER_ADMIN",
                "Il doit rester au moins un Super Admin actif.",
            )

    if donnees.email is not None and donnees.email != utilisateur.email:
        if await _email_existe(session, donnees.email, sauf=utilisateur.id):
            raise _email_deja_utilise(donnees.email)
        utilisateur.email = donnees.email
    if donnees.nom_complet is not None:
        utilisateur.nom_complet = donnees.nom_complet.strip()
    if donnees.role is not None:
        utilisateur.role = donnees.role
    if donnees.est_actif is not None:
        utilisateur.est_actif = donnees.est_actif
    if donnees.mot_de_passe is not None:
        # Le nouveau hash invalide les jetons déjà émis (security.version_mot_de_passe)
        utilisateur.mot_de_passe_hash = hacher_mot_de_passe(donnees.mot_de_passe)

    try:
        await session.commit()
    except IntegrityError as erreur:
        await session.rollback()
        raise _email_deja_utilise(donnees.email or "") from erreur
    await session.refresh(utilisateur)
    return utilisateur


class SuperAdminDejaPresent(Exception):
    """Un Super Admin existe déjà : les autres comptes se créent dans l'application."""


async def creer_premier_super_admin(
    session: AsyncSession, nom_complet: str, email: str, mot_de_passe: str
) -> Utilisateur:
    """S1-T1 : premier compte, créé en ligne de commande sur une base vierge."""
    existe = (
        await session.execute(
            select(Utilisateur.id).where(Utilisateur.role == RoleUtilisateur.SUPER_ADMIN)
        )
    ).first()
    if existe is not None:
        raise SuperAdminDejaPresent
    donnees = UtilisateurCreation(
        nom_complet=nom_complet,
        email=email,
        role=RoleUtilisateur.SUPER_ADMIN,
        mot_de_passe=mot_de_passe,
    )
    return await creer_utilisateur(session, donnees)
