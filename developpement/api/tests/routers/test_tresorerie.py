"""US-REF-03 : comptes de trésorerie et soldes d'ouverture (règles 3, 4, 6, 9)."""

from collections.abc import Awaitable, Callable
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CompteTresorerie, TransactionTresorerie, Utilisateur
from app.models.enums import RoleUtilisateur, TypeFluxTresorerie
from tests.conftest import entetes_pour

CreerCompte = Callable[..., Awaitable[Utilisateur]]


@pytest.fixture
async def admin(creer_compte: CreerCompte) -> Utilisateur:
    return await creer_compte(RoleUtilisateur.SUPER_ADMIN)


async def caisse(db_session: AsyncSession) -> CompteTresorerie:
    requete = select(CompteTresorerie).where(CompteTresorerie.code == "CAISSE")
    return (await db_session.execute(requete)).scalar_one()


@pytest.mark.parametrize("role", list(RoleUtilisateur))
async def test_tous_les_roles_voient_les_comptes(
    client: AsyncClient, creer_compte: CreerCompte, role: RoleUtilisateur
) -> None:
    utilisateur = await creer_compte(role)

    reponse = await client.get("/api/v1/tresorerie/comptes", headers=entetes_pour(utilisateur))

    assert reponse.status_code == 200
    comptes = reponse.json()
    # Comptes fournis au départ (US-REF-03)
    assert [c["code"] for c in comptes] == ["CAISSE", "BANQUE", "ORANGE_MONEY", "MOBICASH", "WAVE"]
    assert comptes[0]["solde_actuel"] == "0.00"  # montants en chaînes décimales
    assert comptes[0]["solde_ouverture_saisi"] is False


async def test_ajout_d_un_compte_mobile_money(client: AsyncClient, admin: Utilisateur) -> None:
    reponse = await client.post(
        "/api/v1/tresorerie/comptes",
        json={"nom": "Moov Money", "type": "MOBILE_MONEY", "operateur": "Moov Africa"},
        headers=entetes_pour(admin),
    )

    assert reponse.status_code == 201
    assert reponse.json()["code"] == "MOOV_MONEY"
    assert reponse.json()["operateur"] == "Moov Africa"


async def test_code_unique_deduit_du_nom(client: AsyncClient, admin: Utilisateur) -> None:
    entetes = entetes_pour(admin)
    premier = await client.post(
        "/api/v1/tresorerie/comptes",
        json={"nom": "Banque Atlantique", "type": "BANQUE"},
        headers=entetes,
    )
    second = await client.post(
        "/api/v1/tresorerie/comptes",
        json={"nom": "Banque atlantique ", "type": "BANQUE"},
        headers=entetes,
    )
    troisieme = await client.post(
        "/api/v1/tresorerie/comptes",
        json={"nom": "Banque Atlantique (épargne)", "type": "BANQUE"},
        headers=entetes,
    )

    assert premier.json()["code"] == "BANQUE_ATLANTIQUE"
    assert second.status_code == 409  # même nom, à la casse près
    assert second.json()["code"] == "NOM_DEJA_UTILISE"
    assert troisieme.json()["code"] == "BANQUE_ATLANTIQUE_EP"


@pytest.mark.parametrize(
    ("corps", "code_erreur"),
    [
        ({"nom": "Moov", "type": "MOBILE_MONEY"}, "Indiquez l'opérateur"),
        ({"nom": "Coffre", "type": "CAISSE", "operateur": "Orange"}, "Seul un compte Mobile"),
    ],
)
async def test_operateur_et_type_coherents(
    client: AsyncClient, admin: Utilisateur, corps: dict[str, str], code_erreur: str
) -> None:
    reponse = await client.post(
        "/api/v1/tresorerie/comptes", json=corps, headers=entetes_pour(admin)
    )

    assert reponse.status_code == 422
    assert code_erreur in str(reponse.json()["details"])


async def test_desactivation_et_renommage(
    client: AsyncClient, admin: Utilisateur, db_session: AsyncSession
) -> None:
    compte = await caisse(db_session)

    reponse = await client.put(
        f"/api/v1/tresorerie/comptes/{compte.id}",
        json={"nom": "Caisse du magasin", "est_actif": False},
        headers=entetes_pour(admin),
    )

    assert reponse.status_code == 200
    assert reponse.json()["nom"] == "Caisse du magasin"
    assert reponse.json()["est_actif"] is False


async def test_solde_d_ouverture_journal_et_solde_ensemble(
    client: AsyncClient, admin: Utilisateur, db_session: AsyncSession
) -> None:
    compte = await caisse(db_session)

    reponse = await client.post(
        f"/api/v1/tresorerie/comptes/{compte.id}/solde-ouverture",
        json={"montant": "2030000"},
        headers=entetes_pour(admin),
    )

    assert reponse.status_code == 200
    assert reponse.json()["solde_actuel"] == "2030000.00"
    assert reponse.json()["solde_ouverture_saisi"] is True
    ecriture = (
        await db_session.execute(
            select(TransactionTresorerie).where(TransactionTresorerie.compte_id == compte.id)
        )
    ).scalar_one()
    assert ecriture.type_flux == TypeFluxTresorerie.SOLDE_INITIAL
    assert (ecriture.sens, ecriture.solde_avant, ecriture.solde_apres) == (
        "CREDIT",
        Decimal("0.00"),
        Decimal("2030000.00"),
    )
    assert ecriture.utilisateur_id == admin.id


async def test_solde_d_ouverture_une_seule_fois(
    client: AsyncClient, admin: Utilisateur, db_session: AsyncSession
) -> None:
    compte = await caisse(db_session)
    adresse = f"/api/v1/tresorerie/comptes/{compte.id}/solde-ouverture"

    await client.post(adresse, json={"montant": "50000"}, headers=entetes_pour(admin))
    seconde = await client.post(adresse, json={"montant": "70000"}, headers=entetes_pour(admin))

    assert seconde.status_code == 409
    assert seconde.json()["code"] == "SOLDE_OUVERTURE_DEJA_SAISI"
    await db_session.refresh(compte)
    assert compte.solde_actuel == Decimal("50000.00")


@pytest.mark.parametrize("montant", ["0", "-5000", "1500.50", "abc"])
async def test_montant_d_ouverture_invalide(
    client: AsyncClient, admin: Utilisateur, db_session: AsyncSession, montant: str
) -> None:
    compte = await caisse(db_session)

    reponse = await client.post(
        f"/api/v1/tresorerie/comptes/{compte.id}/solde-ouverture",
        json={"montant": montant},
        headers=entetes_pour(admin),
    )

    assert reponse.status_code == 422


@pytest.mark.parametrize("role", [RoleUtilisateur.GESTIONNAIRE, RoleUtilisateur.CONSULTANT])
async def test_parametrage_reserve_au_super_admin(
    client: AsyncClient, creer_compte: CreerCompte, db_session: AsyncSession, role: RoleUtilisateur
) -> None:
    utilisateur = await creer_compte(role)
    entetes = entetes_pour(utilisateur)
    compte = await caisse(db_session)

    creation = await client.post(
        "/api/v1/tresorerie/comptes", json={"nom": "Autre", "type": "CAISSE"}, headers=entetes
    )
    ouverture = await client.post(
        f"/api/v1/tresorerie/comptes/{compte.id}/solde-ouverture",
        json={"montant": "1000"},
        headers=entetes,
    )

    assert creation.status_code == ouverture.status_code == 403


async def test_compte_introuvable(client: AsyncClient, admin: Utilisateur) -> None:
    reponse = await client.put(
        "/api/v1/tresorerie/comptes/99999", json={"nom": "X Y"}, headers=entetes_pour(admin)
    )

    assert reponse.status_code == 404
    assert reponse.json()["code"] == "COMPTE_INTROUVABLE"
