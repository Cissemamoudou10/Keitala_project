"""Base des parcours de bout en bout, séparée de la base de développement (P-016, D-029).

Crée la base si elle n'existe pas, applique les migrations et prépare les comptes de
test (`comptes_e2e`). Lancée au démarrage du service Docker `api-e2e` :

    docker compose -f developpement/docker-compose.yml up -d api-e2e

Refus : hors ENV=dev, ou si le nom de la base ne contient pas « e2e » (garde-fou : on ne
prépare jamais la base de développement ni une base de production par erreur).
"""

import asyncio
import os
import sys
from pathlib import Path

from sqlalchemy import make_url, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from alembic import command
from alembic.config import Config
from app.commandes.comptes_e2e import preparer_comptes
from app.core.config import settings

DOSSIER_API = Path(__file__).resolve().parents[2]


async def _creer_base_si_absente(url: str) -> None:
    cible = make_url(url)
    admin = create_async_engine(
        cible.set(database="postgres"), isolation_level="AUTOCOMMIT", poolclass=NullPool
    )
    async with admin.connect() as connexion:
        existe = await connexion.scalar(
            text("SELECT 1 FROM pg_database WHERE datname = :nom"), {"nom": cible.database}
        )
        if not existe:
            await connexion.execute(text(f'CREATE DATABASE "{cible.database}"'))
            print(f"Base {cible.database} créée.")
    await admin.dispose()


async def _comptes(url: str, mot_de_passe: str) -> None:
    moteur = create_async_engine(url, poolclass=NullPool)
    try:
        async with AsyncSession(moteur, expire_on_commit=False) as session:
            await preparer_comptes(session, mot_de_passe)
    finally:
        await moteur.dispose()


def main() -> None:
    url = settings.DATABASE_URL
    nom = make_url(url).database or ""
    if settings.ENV != "dev" or "e2e" not in nom:
        sys.exit("Refusé : base de parcours e2e seulement (ENV=dev, nom contenant « e2e »).")
    mot_de_passe = os.environ.get("E2E_MOT_DE_PASSE", "")
    if len(mot_de_passe) < 8:
        sys.exit("Définissez E2E_MOT_DE_PASSE (8 caractères au moins).")

    asyncio.run(_creer_base_si_absente(url))
    config = Config(str(DOSSIER_API / "alembic.ini"))
    config.set_main_option("script_location", str(DOSSIER_API / "alembic"))
    config.set_main_option(
        "sqlalchemy.url", make_url(url).render_as_string(hide_password=False).replace("%", "%%")
    )
    command.upgrade(config, "head")
    asyncio.run(_comptes(url, mot_de_passe))
    print(f"Base {nom} prête pour les parcours de bout en bout.")


if __name__ == "__main__":
    main()
