"""US-REF-01 : répertoire des clients et fournisseurs, soldes, doublons."""

from collections.abc import Awaitable, Callable
from decimal import Decimal
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Achat, CompteTresorerie, Reglement, Tiers, Utilisateur, Vente
from app.models.enums import RoleUtilisateur
from tests.conftest import entetes_pour

CreerCompte = Callable[..., Awaitable[Utilisateur]]

BOUTIQUE: dict[str, Any] = {
    "nom": "Boutique Diarra",
    "telephone": "+223 76 12 34 56",
    "adresse": "Marché de Médine, Bamako",
    "est_client": True,
}


@pytest.fixture
async def gestionnaire(creer_compte: CreerCompte) -> Utilisateur:
    return await creer_compte(RoleUtilisateur.GESTIONNAIRE)


async def test_creation_et_fiche(client: AsyncClient, gestionnaire: Utilisateur) -> None:
    entetes = entetes_pour(gestionnaire)

    creation = await client.post("/api/v1/tiers", json=BOUTIQUE, headers=entetes)
    fiche = await client.get(f"/api/v1/tiers/{creation.json()['id']}", headers=entetes)

    assert creation.status_code == 201
    assert fiche.json()["nom"] == "Boutique Diarra"
    assert fiche.json()["est_client"] is True
    assert fiche.json()["est_fournisseur"] is False
    assert (fiche.json()["solde_creance"], fiche.json()["solde_dette"]) == ("0", "0")


async def test_client_ou_fournisseur_obligatoire(
    client: AsyncClient, gestionnaire: Utilisateur
) -> None:
    reponse = await client.post(
        "/api/v1/tiers",
        json={**BOUTIQUE, "est_client": False},
        headers=entetes_pour(gestionnaire),
    )

    assert reponse.status_code == 422
    assert "Cochez" in str(reponse.json()["details"])


@pytest.mark.parametrize(
    "variante",
    [
        {"nom": "  boutique DIARRA ", "telephone": None},  # même nom, accents et casse ignorés
        {"nom": "Autre nom", "telephone": "76 12 34 56"},  # même numéro, sans indicatif
    ],
)
async def test_doublon_probable_puis_confirme(
    client: AsyncClient, gestionnaire: Utilisateur, variante: dict[str, Any]
) -> None:
    entetes = entetes_pour(gestionnaire)
    premier = await client.post("/api/v1/tiers", json=BOUTIQUE, headers=entetes)

    doublon = await client.post("/api/v1/tiers", json={**BOUTIQUE, **variante}, headers=entetes)
    confirme = await client.post(
        "/api/v1/tiers",
        json={**BOUTIQUE, **variante, "confirmer_doublon": True},
        headers=entetes,
    )

    assert doublon.status_code == 409
    assert doublon.json()["code"] == "DOUBLON_PROBABLE"
    assert doublon.json()["details"]["tiers"][0]["id"] == premier.json()["id"]
    assert confirme.status_code == 201


async def test_recherche_et_filtre_par_type(client: AsyncClient, gestionnaire: Utilisateur) -> None:
    entetes = entetes_pour(gestionnaire)
    await client.post("/api/v1/tiers", json=BOUTIQUE, headers=entetes)
    await client.post(
        "/api/v1/tiers",
        json={"nom": "Coopérative de Ségou", "est_fournisseur": True},
        headers=entetes,
    )

    fournisseurs = await client.get(
        "/api/v1/tiers", params={"type": "fournisseur"}, headers=entetes
    )
    recherche = await client.get("/api/v1/tiers", params={"recherche": "segou"}, headers=entetes)
    par_numero = await client.get("/api/v1/tiers", params={"recherche": "12 34"}, headers=entetes)

    assert [t["nom"] for t in fournisseurs.json()["items"]] == ["Coopérative de Ségou"]
    assert [t["nom"] for t in recherche.json()["items"]] == ["Coopérative de Ségou"]
    assert [t["nom"] for t in par_numero.json()["items"]] == ["Boutique Diarra"]


async def test_soldes_creance_et_dette(
    client: AsyncClient, gestionnaire: Utilisateur, db_session: AsyncSession
) -> None:
    tiers = Tiers(nom="Mamadou Traoré", est_client=True, est_fournisseur=True)
    db_session.add(tiers)
    await db_session.flush()
    caisse = (
        await db_session.execute(select(CompteTresorerie).where(CompteTresorerie.code == "CAISSE"))
    ).scalar_one()
    vente = Vente(
        numero_facture="FAC-2026-0042",
        client_id=tiers.id,
        montant_total=Decimal("45000"),
        cree_par=gestionnaire.id,
    )
    achat = Achat(
        numero="ACH-2026-0007",
        fournisseur_id=tiers.id,
        montant_total=Decimal("100000"),
        cree_par=gestionnaire.id,
    )
    db_session.add_all([vente, achat])
    await db_session.flush()
    db_session.add(
        Reglement(
            vente_id=vente.id,
            compte_id=caisse.id,
            montant=Decimal("20000"),
            cree_par=gestionnaire.id,
        )
    )
    await db_session.flush()

    reponse = await client.get(f"/api/v1/tiers/{tiers.id}", headers=entetes_pour(gestionnaire))

    assert reponse.json()["solde_creance"] == "25000.00"  # reste à payer par le client
    assert reponse.json()["solde_dette"] == "100000.00"  # dû au fournisseur


async def test_modification_et_desactivation(
    client: AsyncClient, gestionnaire: Utilisateur
) -> None:
    entetes = entetes_pour(gestionnaire)
    creation = await client.post("/api/v1/tiers", json=BOUTIQUE, headers=entetes)
    adresse = f"/api/v1/tiers/{creation.json()['id']}"

    modification = await client.put(
        adresse,
        json={"est_fournisseur": True, "telephone": "", "est_actif": False},
        headers=entetes,
    )
    refus = await client.put(
        adresse, json={"est_client": False, "est_fournisseur": False}, headers=entetes
    )
    liste = await client.get("/api/v1/tiers", headers=entetes)

    assert modification.status_code == 200
    assert modification.json()["est_fournisseur"] is True
    assert modification.json()["telephone"] is None
    assert refus.status_code == 400
    assert refus.json()["code"] == "TYPE_TIERS_REQUIS"
    assert liste.json()["total"] == 0  # les inactifs sont masqués par défaut


async def test_consultant_lit_sans_ecrire(
    client: AsyncClient, creer_compte: CreerCompte, gestionnaire: Utilisateur
) -> None:
    consultant = await creer_compte(RoleUtilisateur.CONSULTANT)
    await client.post("/api/v1/tiers", json=BOUTIQUE, headers=entetes_pour(gestionnaire))

    lecture = await client.get("/api/v1/tiers", headers=entetes_pour(consultant))
    ecriture = await client.post("/api/v1/tiers", json=BOUTIQUE, headers=entetes_pour(consultant))

    assert lecture.json()["total"] == 1
    assert ecriture.status_code == 403
