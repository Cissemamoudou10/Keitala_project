"""Comptes de test des parcours de bout en bout (Playwright), un par rôle.

Développement et CI seulement : refusé si ENV n'est pas « dev ». Le mot de passe vient
de la variable E2E_MOT_DE_PASSE (valeur de test, voir developpement/app/.env.example).
Idempotent : relancée, la commande remet les comptes dans leur état de départ.

    E2E_MOT_DE_PASSE=... uv run --frozen python -m app.commandes.comptes_e2e
"""

import asyncio
import os
import sys

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.security import hacher_mot_de_passe
from app.models import Utilisateur
from app.models.enums import RoleUtilisateur

COMPTES = {
    "e2e-super-admin@keitala.test": ("Super Admin (test)", RoleUtilisateur.SUPER_ADMIN),
    "e2e-gestionnaire@keitala.test": ("Gestionnaire (test)", RoleUtilisateur.GESTIONNAIRE),
    "e2e-consultant@keitala.test": ("Consultant (test)", RoleUtilisateur.CONSULTANT),
}


async def preparer_comptes(session: AsyncSession, mot_de_passe: str) -> None:
    empreinte = hacher_mot_de_passe(mot_de_passe)
    for email, (nom, role) in COMPTES.items():
        utilisateur = (
            await session.execute(select(Utilisateur).where(Utilisateur.email == email))
        ).scalar_one_or_none()
        if utilisateur is None:
            utilisateur = Utilisateur(email=email)
            session.add(utilisateur)
        utilisateur.nom_complet = nom
        utilisateur.role = role
        utilisateur.est_actif = True
        utilisateur.mot_de_passe_hash = empreinte
    await session.commit()


async def _executer(mot_de_passe: str) -> None:
    moteur = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    try:
        async with AsyncSession(moteur, expire_on_commit=False) as session:
            await preparer_comptes(session, mot_de_passe)
    finally:
        await moteur.dispose()


def main() -> None:
    if settings.ENV != "dev":
        sys.exit("Comptes de test refusés hors développement (ENV doit valoir « dev »).")
    mot_de_passe = os.environ.get("E2E_MOT_DE_PASSE", "")
    if len(mot_de_passe) < 8:
        sys.exit("Définissez E2E_MOT_DE_PASSE (8 caractères au moins).")
    asyncio.run(_executer(mot_de_passe))
    print(f"{len(COMPTES)} comptes de test prêts : {', '.join(COMPTES)}.")


if __name__ == "__main__":
    main()
