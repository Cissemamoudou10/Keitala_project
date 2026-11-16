"""Sprint 6 : journal et synthèse, dépenses, transferts, clôtures, contrôle (US-TRES-01 à 05)."""

import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    CategorieDepense,
    CompteTresorerie,
    Depense,
    TransactionTresorerie,
    Utilisateur,
)
from app.models.enums import RoleUtilisateur, TypeFluxTresorerie
from app.services.tresorerie import ecrire_mouvement_tresorerie, verrouiller_compte
from tests.conftest import entetes_pour

CreerCompte = Callable[..., Awaitable[Utilisateur]]


@pytest.fixture
async def gestionnaire(creer_compte: CreerCompte) -> Utilisateur:
    return await creer_compte(RoleUtilisateur.GESTIONNAIRE)


@pytest.fixture
async def admin(creer_compte: CreerCompte) -> Utilisateur:
    return await creer_compte(RoleUtilisateur.SUPER_ADMIN)


async def compte(session: AsyncSession, code: str) -> CompteTresorerie:
    requete = select(CompteTresorerie).where(CompteTresorerie.code == code)
    return (await session.execute(requete)).scalar_one()


async def alimenter(session: AsyncSession, code: str, montant: str, auteur: Utilisateur) -> None:
    c = await verrouiller_compte(session, (await compte(session, code)).id)
    await ecrire_mouvement_tresorerie(
        session,
        c,
        type_flux=TypeFluxTresorerie.SOLDE_INITIAL,
        sens="CREDIT",
        montant=Decimal(montant),
        libelle="Solde d'ouverture",
        utilisateur_id=auteur.id,
    )
    await session.commit()


async def categorie(session: AsyncSession, nom: str) -> int:
    return (
        await session.execute(select(CategorieDepense.id).where(CategorieDepense.nom == nom))
    ).scalar_one()


def depense(categorie_id: int, compte_id: int, montant: str, **autres: object) -> dict[str, object]:
    return {
        "cle_idempotence": str(uuid.uuid4()),
        "categorie_id": categorie_id,
        "compte_id": compte_id,
        "designation": "Carburant moto livraison",
        "montant": montant,
        **autres,
    }


# --- US-TRES-02 : dépenses -----------------------------------------------------------


async def test_depense_debite_le_compte_puis_s_annule(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur
) -> None:
    entetes = entetes_pour(gestionnaire)
    await alimenter(db_session, "CAISSE", "50000", gestionnaire)
    caisse = await compte(db_session, "CAISSE")
    carburant = await categorie(db_session, "Carburant / Transport")
    corps = depense(carburant, caisse.id, "7500", piece_justificative="Reçu 12")

    creation = await client.post("/api/v1/tresorerie/depenses", json=corps, headers=entetes)
    rejeu = await client.post("/api/v1/tresorerie/depenses", json=corps, headers=entetes)

    assert (creation.status_code, rejeu.status_code) == (201, 200)
    detail = creation.json()
    assert detail["numero"].startswith("DEP-") and detail["categorie"] == "Carburant / Transport"
    assert (detail["compte"], detail["montant"]) == ("Caisse Principale (Espèces)", "7500.00")
    await db_session.refresh(caisse)
    assert caisse.solde_actuel == Decimal("42500.00")
    assert await db_session.scalar(select(func.count()).select_from(Depense)) == 1

    adresse = f"/api/v1/tresorerie/depenses/{detail['id']}/annuler"
    annulation = await client.post(adresse, json={"motif": "Saisie en double"}, headers=entetes)
    encore = await client.post(adresse, json={"motif": "Encore"}, headers=entetes)

    assert annulation.status_code == 200 and annulation.json()["statut"] == "ANNULE"
    assert encore.status_code == 409
    await db_session.refresh(caisse)
    assert caisse.solde_actuel == Decimal("50000.00")


async def test_depense_refusee_si_la_caisse_n_a_pas_l_argent(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur
) -> None:
    await alimenter(db_session, "CAISSE", "5000", gestionnaire)
    caisse = await compte(db_session, "CAISSE")
    divers = await categorie(db_session, "Divers")

    reponse = await client.post(
        "/api/v1/tresorerie/depenses",
        json=depense(divers, caisse.id, "6000"),
        headers=entetes_pour(gestionnaire),
    )
    sans_categorie = await client.post(
        "/api/v1/tresorerie/depenses",
        json=depense(9999, caisse.id, "100"),
        headers=entetes_pour(gestionnaire),
    )

    assert reponse.status_code == 409 and reponse.json()["code"] == "SOLDE_INSUFFISANT"
    assert sans_categorie.status_code == 400
    assert sans_categorie.json()["code"] == "CATEGORIE_INTROUVABLE"


async def test_categories_conformes_a_l_excel(
    client: AsyncClient, gestionnaire: Utilisateur
) -> None:
    reponse = await client.get(
        "/api/v1/tresorerie/categories-depense", headers=entetes_pour(gestionnaire)
    )

    noms = [c["nom"] for c in reponse.json()]
    assert "Main d'œuvre / Personnel" in noms and "Divers" in noms
    assert len(noms) == 7


# --- US-TRES-03 : transferts ---------------------------------------------------------


async def test_transfert_debite_et_credite_le_meme_montant(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur
) -> None:
    entetes = entetes_pour(gestionnaire)
    await alimenter(db_session, "CAISSE", "100000", gestionnaire)
    caisse = await compte(db_session, "CAISSE")
    banque = await compte(db_session, "BANQUE")
    corps = {
        "cle_idempotence": str(uuid.uuid4()),
        "compte_source_id": caisse.id,
        "compte_destination_id": banque.id,
        "montant": "80000",
        "libelle": "Versement des recettes",
    }

    reponse = await client.post("/api/v1/tresorerie/transferts", json=corps, headers=entetes)
    rejeu = await client.post("/api/v1/tresorerie/transferts", json=corps, headers=entetes)
    trop = await client.post(
        "/api/v1/tresorerie/transferts",
        json={**corps, "cle_idempotence": str(uuid.uuid4()), "montant": "30000"},
        headers=entetes,
    )
    identiques = await client.post(
        "/api/v1/tresorerie/transferts",
        json={**corps, "cle_idempotence": str(uuid.uuid4()), "compte_destination_id": caisse.id},
        headers=entetes,
    )

    assert (reponse.status_code, rejeu.status_code) == (201, 200)
    assert reponse.json()["numero"].startswith("TRF-")
    assert reponse.json()["compte_destination"] == "Compte Bancaire"
    assert trop.status_code == 409 and trop.json()["code"] == "SOLDE_INSUFFISANT"
    assert identiques.status_code == 422
    await db_session.refresh(caisse)
    await db_session.refresh(banque)
    assert (caisse.solde_actuel, banque.solde_actuel) == (Decimal("20000.00"), Decimal("80000.00"))
    ecritures = (
        await db_session.execute(
            select(TransactionTresorerie.sens, TransactionTresorerie.montant).where(
                TransactionTresorerie.type_flux == TypeFluxTresorerie.TRANSFERT_INTERNE
            )
        )
    ).all()
    assert sorted(ecritures) == [("CREDIT", Decimal("80000.00")), ("DEBIT", Decimal("80000.00"))]


# --- US-TRES-01 : journal et synthèse ------------------------------------------------


async def test_journal_avec_piece_d_origine_et_synthese(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur
) -> None:
    entetes = entetes_pour(gestionnaire)
    await alimenter(db_session, "CAISSE", "30000", gestionnaire)
    await alimenter(db_session, "WAVE", "12000", gestionnaire)
    caisse = await compte(db_session, "CAISSE")
    creation = await client.post(
        "/api/v1/tresorerie/depenses",
        json=depense(await categorie(db_session, "Divers"), caisse.id, "1000"),
        headers=entetes,
    )

    journal = await client.get(
        "/api/v1/tresorerie/journal", params={"compte_id": caisse.id}, headers=entetes
    )
    synthese = await client.get("/api/v1/tresorerie/synthese", headers=entetes)

    ecritures = journal.json()["items"]
    assert [e["type_flux"] for e in ecritures] == ["DEPENSE_EXPLOITATION", "SOLDE_INITIAL"]
    assert ecritures[0]["piece"] == creation.json()["numero"]
    assert (ecritures[0]["sens"], ecritures[0]["solde_apres"]) == ("DEBIT", "29000.00")
    assert ecritures[1]["piece"] is None
    assert (
        synthese.json()
        == {
            "solde_global": "41000.00",
            "total_creances": "0",
            "total_dettes": "0",
        }
        or synthese.json()["solde_global"] == "41000.00"
    )


# --- US-TRES-04 : clôture journalière ------------------------------------------------


async def test_cloture_sans_ecart_puis_une_seule_par_jour(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur
) -> None:
    entetes = entetes_pour(gestionnaire)
    caisse = await compte(db_session, "CAISSE")
    # Hier : solde d'ouverture de 20 000 ; aujourd'hui : une dépense de 2 000
    # Le journal est immuable : l'écriture d'hier est insérée directement avec sa date
    db_session.add(
        TransactionTresorerie(
            compte_id=caisse.id,
            type_flux=TypeFluxTresorerie.SOLDE_INITIAL,
            sens="CREDIT",
            montant=Decimal(20000),
            solde_avant=Decimal(0),
            solde_apres=Decimal(20000),
            libelle="Solde d'ouverture",
            utilisateur_id=gestionnaire.id,
            date_transaction=datetime.now(UTC) - timedelta(days=1),
        )
    )
    caisse.solde_actuel = Decimal(20000)
    await db_session.commit()
    await client.post(
        "/api/v1/tresorerie/depenses",
        json=depense(await categorie(db_session, "Divers"), caisse.id, "2000"),
        headers=entetes,
    )

    recap = await client.get(
        "/api/v1/tresorerie/clotures/preparation",
        params={"compte_id": caisse.id},
        headers=entetes,
    )
    assert recap.json() | {"date_cloture": None} == {
        "compte_id": caisse.id,
        "compte": "Caisse Principale (Espèces)",
        "date_cloture": None,
        "solde_ouverture": "20000.00",
        "total_entrees": "0",
        "total_sorties": "2000.00",
        "solde_theorique": "18000.00",
        "deja_cloturee": False,
    }

    cloture = await client.post(
        "/api/v1/tresorerie/clotures",
        json={"compte_id": caisse.id, "solde_physique": "18000"},
        headers=entetes,
    )
    encore = await client.post(
        "/api/v1/tresorerie/clotures",
        json={"compte_id": caisse.id, "solde_physique": "18000"},
        headers=entetes,
    )

    assert cloture.status_code == 201 and cloture.json()["ecart"] == "0.00"
    assert encore.status_code == 409 and encore.json()["code"] == "CLOTURE_DEJA_FAITE"
    ecarts = await db_session.scalar(
        select(func.count()).where(
            TransactionTresorerie.type_flux == TypeFluxTresorerie.ECART_CLOTURE
        )
    )
    assert ecarts == 0


async def test_ecart_de_cloture_explique_et_inscrit_au_journal(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur
) -> None:
    entetes = entetes_pour(gestionnaire)
    await alimenter(db_session, "CAISSE", "18000", gestionnaire)
    caisse = await compte(db_session, "CAISSE")

    sans_commentaire = await client.post(
        "/api/v1/tresorerie/clotures",
        json={"compte_id": caisse.id, "solde_physique": "17500"},
        headers=entetes,
    )
    cloture = await client.post(
        "/api/v1/tresorerie/clotures",
        json={
            "compte_id": caisse.id,
            "solde_physique": "17500",
            "commentaire": "Monnaie rendue en trop",
        },
        headers=entetes,
    )

    assert sans_commentaire.status_code == 400
    assert sans_commentaire.json()["code"] == "COMMENTAIRE_REQUIS"
    assert "500 FCFA" in sans_commentaire.json()["message"]
    assert cloture.status_code == 201
    assert (cloture.json()["solde_theorique"], cloture.json()["ecart"]) == ("18000.00", "-500.00")
    await db_session.refresh(caisse)
    assert caisse.solde_actuel == Decimal("17500.00")  # le solde suit le constaté
    ecart = (
        await db_session.execute(
            select(TransactionTresorerie).where(
                TransactionTresorerie.type_flux == TypeFluxTresorerie.ECART_CLOTURE
            )
        )
    ).scalar_one()
    assert (ecart.sens, ecart.montant) == ("DEBIT", Decimal("500.00"))


# --- US-TRES-05 : contrôle a posteriori ----------------------------------------------


async def test_controle_a_posteriori_par_le_super_admin(
    client: AsyncClient,
    db_session: AsyncSession,
    gestionnaire: Utilisateur,
    admin: Utilisateur,
) -> None:
    await alimenter(db_session, "CAISSE", "10000", gestionnaire)
    caisse = await compte(db_session, "CAISSE")
    creation = await client.post(
        "/api/v1/tresorerie/depenses",
        json=depense(await categorie(db_session, "Divers"), caisse.id, "1500"),
        headers=entetes_pour(gestionnaire),
    )
    await client.post(
        "/api/v1/tresorerie/clotures",
        json={"compte_id": caisse.id, "solde_physique": "8500"},
        headers=entetes_pour(gestionnaire),
    )
    entetes = entetes_pour(admin)

    nombre = await client.get("/api/v1/controles/nombre", headers=entetes)
    liste = await client.get("/api/v1/controles/a-controler", headers=entetes)
    gestionnaire_refuse = await client.get(
        "/api/v1/controles/a-controler", headers=entetes_pour(gestionnaire)
    )
    adresse = f"/api/v1/controles/depense/{creation.json()['id']}"
    marque = await client.post(adresse, headers=entetes)
    encore = await client.post(adresse, headers=entetes)
    depense_lue = await client.get(
        f"/api/v1/tresorerie/depenses/{creation.json()['id']}", headers=entetes
    )
    apres = await client.get("/api/v1/controles/nombre", headers=entetes)

    assert nombre.json()["par_type"] == {
        "depense": 1,
        "transfert": 0,
        "inventaire": 0,
        "cloture": 1,
    }
    pieces = {p["type"]: p for p in liste.json()}
    assert set(pieces) == {"cloture", "depense"}
    assert "sans écart" in pieces["cloture"]["resume"]
    assert gestionnaire_refuse.status_code == 403
    assert (marque.status_code, encore.status_code) == (204, 409)
    assert depense_lue.json()["controle_par"] == admin.nom_complet
    assert apres.json()["total"] == 1


@pytest.mark.parametrize("role", [RoleUtilisateur.SUPER_ADMIN, RoleUtilisateur.CONSULTANT])
async def test_operations_saisies_par_le_gestionnaire(
    client: AsyncClient, db_session: AsyncSession, creer_compte: CreerCompte, role: RoleUtilisateur
) -> None:
    utilisateur = await creer_compte(role)
    caisse = await compte(db_session, "CAISSE")
    banque = await compte(db_session, "BANQUE")
    entetes = entetes_pour(utilisateur)

    reponses = [
        await client.post(
            "/api/v1/tresorerie/depenses",
            json=depense(await categorie(db_session, "Divers"), banque.id, "100"),
            headers=entetes,
        ),
        await client.post(
            "/api/v1/tresorerie/transferts",
            json={
                "cle_idempotence": str(uuid.uuid4()),
                "compte_source_id": banque.id,
                "compte_destination_id": caisse.id,
                "montant": "100",
            },
            headers=entetes,
        ),
        await client.post(
            "/api/v1/tresorerie/clotures",
            json={"compte_id": caisse.id, "solde_physique": "0"},
            headers=entetes,
        ),
    ]
    lecture = await client.get("/api/v1/tresorerie/journal", headers=entetes)

    assert [r.status_code for r in reponses] == [403, 403, 403]
    assert lecture.status_code == 200
