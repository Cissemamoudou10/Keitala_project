"""AGENTS.md règle 9 / US-AUTH-03 : toute écriture d'un CONSULTANT est refusée (403).

Vérifié sur un routeur métier factice muni de `ACCES_METIER`, comme le seront tous
les routeurs des sprints suivants.
"""

from collections.abc import AsyncGenerator, Awaitable, Callable

import pytest
from fastapi import APIRouter, FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependances import ACCES_METIER
from app.core.erreurs import enregistrer_gestionnaires_erreurs
from app.db.session import get_db
from app.models import Utilisateur
from app.models.enums import RoleUtilisateur
from tests.conftest import entetes_pour

CreerCompte = Callable[..., Awaitable[Utilisateur]]


@pytest.fixture
async def client_metier(db_session: AsyncSession) -> AsyncGenerator[AsyncClient]:
    routeur = APIRouter(prefix="/ventes", dependencies=ACCES_METIER)

    @routeur.get("")
    async def lister() -> list[str]:
        return []

    for methode in ("post", "put", "patch", "delete"):
        routeur.add_api_route("", lambda: {"ok": True}, methods=[methode.upper()])

    app = FastAPI()
    enregistrer_gestionnaires_erreurs(app)
    app.include_router(routeur)

    async def get_db_test() -> AsyncGenerator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_db] = get_db_test
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


@pytest.mark.parametrize("methode", ["POST", "PUT", "PATCH", "DELETE"])
async def test_consultant_ne_peut_pas_ecrire(
    client_metier: AsyncClient, creer_compte: CreerCompte, methode: str
) -> None:
    consultant = await creer_compte(RoleUtilisateur.CONSULTANT)

    reponse = await client_metier.request(methode, "/ventes", headers=entetes_pour(consultant))

    assert reponse.status_code == 403
    assert reponse.json()["code"] == "ACCES_REFUSE"


async def test_consultant_peut_lire(client_metier: AsyncClient, creer_compte: CreerCompte) -> None:
    consultant = await creer_compte(RoleUtilisateur.CONSULTANT)

    reponse = await client_metier.get("/ventes", headers=entetes_pour(consultant))

    assert reponse.status_code == 200


@pytest.mark.parametrize("role", [RoleUtilisateur.GESTIONNAIRE, RoleUtilisateur.SUPER_ADMIN])
async def test_les_autres_roles_peuvent_ecrire(
    client_metier: AsyncClient, creer_compte: CreerCompte, role: RoleUtilisateur
) -> None:
    utilisateur = await creer_compte(role)

    reponse = await client_metier.post("/ventes", headers=entetes_pour(utilisateur))

    assert reponse.status_code == 200


async def test_session_exigee_meme_en_lecture(client_metier: AsyncClient) -> None:
    assert (await client_metier.get("/ventes")).status_code == 401
