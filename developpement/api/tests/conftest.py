"""Socle de tests : un vrai PostgreSQL, recréé et migré à chaque lancement.

Chaque test tourne dans une transaction annulée à la fin : les tests ne se voient pas
entre eux et la base de test reste dans l'état de la migration (données initiales).
"""

import asyncio
from collections.abc import AsyncGenerator, Awaitable, Callable
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy import make_url, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.security import creer_jeton_acces, hacher_mot_de_passe
from app.db.session import get_db
from app.main import app
from app.models import Utilisateur
from app.models.enums import RoleUtilisateur

DOSSIER_API = Path(__file__).resolve().parent.parent


async def _recreer_base(url_test: str) -> None:
    url = make_url(url_test)
    moteur_admin = create_async_engine(
        url.set(database="postgres"), isolation_level="AUTOCOMMIT", poolclass=NullPool
    )
    async with moteur_admin.connect() as connexion:
        await connexion.execute(text(f'DROP DATABASE IF EXISTS "{url.database}" WITH (FORCE)'))
        await connexion.execute(text(f'CREATE DATABASE "{url.database}"'))
    await moteur_admin.dispose()


@pytest.fixture(scope="session", autouse=True)
def base_de_test() -> None:
    url_test = make_url(settings.TEST_DATABASE_URL)
    # Garde-fou : la base de test est supprimée à chaque lancement
    if url_test.database == make_url(settings.DATABASE_URL).database:
        pytest.exit("TEST_DATABASE_URL doit viser une base distincte de DATABASE_URL.", 2)

    asyncio.run(_recreer_base(settings.TEST_DATABASE_URL))

    config = Config(str(DOSSIER_API / "alembic.ini"))
    config.set_main_option("script_location", str(DOSSIER_API / "alembic"))
    config.set_main_option(
        "sqlalchemy.url", url_test.render_as_string(hide_password=False).replace("%", "%%")
    )
    config.attributes["configure_logger"] = False
    command.upgrade(config, "head")


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession]:
    moteur = create_async_engine(settings.TEST_DATABASE_URL, poolclass=NullPool)
    async with moteur.connect() as connexion:
        transaction = await connexion.begin()
        # Les commit du code testé deviennent des points de sauvegarde
        session = AsyncSession(
            bind=connexion, join_transaction_mode="create_savepoint", expire_on_commit=False
        )
        try:
            yield session
        finally:
            await session.close()
            await transaction.rollback()
    await moteur.dispose()


@pytest.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient]:
    async def get_db_test() -> AsyncGenerator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_db] = get_db_test
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# --- Utilisateurs et sessions -------------------------------------------------------

MOT_DE_PASSE_TEST = "mot-de-passe-de-test"


@pytest.fixture
def creer_compte(db_session: AsyncSession) -> Callable[..., Awaitable[Utilisateur]]:
    """Fabrique de comptes : `await creer_compte(RoleUtilisateur.GESTIONNAIRE)`."""
    compteur = 0

    async def fabriquer(
        role: RoleUtilisateur, *, email: str | None = None, est_actif: bool = True
    ) -> Utilisateur:
        nonlocal compteur
        compteur += 1
        utilisateur = Utilisateur(
            nom_complet=f"{role.value.title()} {compteur}",
            email=email or f"{role.value.lower()}{compteur}@keitala.ml",
            role=role,
            est_actif=est_actif,
            mot_de_passe_hash=hacher_mot_de_passe(MOT_DE_PASSE_TEST),
        )
        db_session.add(utilisateur)
        await db_session.flush()
        return utilisateur

    return fabriquer


def entetes_pour(utilisateur: Utilisateur) -> dict[str, str]:
    """En-tête d'authentification tel que le pose le proxy Next.js."""
    jeton = creer_jeton_acces(utilisateur.id, utilisateur.mot_de_passe_hash)
    return {"Authorization": f"Bearer {jeton}"}
