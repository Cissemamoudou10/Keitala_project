"""Format d'erreur commun : {code, message, details}, message en français."""

from collections.abc import AsyncGenerator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import BaseModel, Field

from app.core.erreurs import ErreurMetier, enregistrer_gestionnaires_erreurs


class Saisie(BaseModel):
    quantite: int = Field(gt=0)
    designation: str


def application_de_test() -> FastAPI:
    app = FastAPI()
    enregistrer_gestionnaires_erreurs(app)

    @app.post("/saisie")
    async def saisie(donnees: Saisie) -> Saisie:
        return donnees

    @app.get("/metier")
    async def metier() -> None:
        raise ErreurMetier(
            "STOCK_INSUFFISANT",
            "Stock insuffisant : il reste 12 sachets.",
            status_code=409,
            details={"disponible": "12"},
        )

    @app.get("/panne")
    async def panne() -> None:
        raise RuntimeError("détail technique à ne pas montrer")

    return app


@pytest.fixture
async def client_test() -> AsyncGenerator[AsyncClient]:
    transport = ASGITransport(app=application_de_test(), raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


async def test_erreur_metier(client_test: AsyncClient) -> None:
    reponse = await client_test.get("/metier")
    assert reponse.status_code == 409
    assert reponse.json() == {
        "code": "STOCK_INSUFFISANT",
        "message": "Stock insuffisant : il reste 12 sachets.",
        "details": {"disponible": "12"},
    }


async def test_erreur_validation_en_francais(client_test: AsyncClient) -> None:
    reponse = await client_test.post("/saisie", json={"quantite": 0})
    assert reponse.status_code == 422
    corps = reponse.json()
    assert corps["code"] == "DONNEES_INVALIDES"
    assert corps["details"] == {
        "quantite": ["La valeur est trop petite."],
        "designation": ["Champ obligatoire."],
    }


async def test_route_inconnue(client_test: AsyncClient) -> None:
    reponse = await client_test.get("/inexistante")
    assert reponse.status_code == 404
    assert reponse.json()["code"] == "RESSOURCE_INTROUVABLE"


async def test_erreur_inattendue_sans_detail_technique(client_test: AsyncClient) -> None:
    reponse = await client_test.get("/panne")
    assert reponse.status_code == 500
    corps = reponse.json()
    assert corps["code"] == "ERREUR_INTERNE"
    assert "détail technique" not in reponse.text
