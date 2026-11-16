"""Sprint 5 : ventes et dons (US-VTE-01, 02, 04 à 06), règles 1 à 6."""

import uuid
from collections.abc import Awaitable, Callable
from decimal import Decimal
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Article,
    CompteTresorerie,
    LigneVente,
    MouvementStock,
    Tiers,
    TransactionTresorerie,
    Utilisateur,
    Vente,
)
from app.models.enums import RoleUtilisateur, TypeFluxTresorerie, TypeMouvementStock
from app.services.stocks import ecrire_mouvement_stock, verrouiller_articles
from app.services.tresorerie import ecrire_mouvement_tresorerie, verrouiller_compte
from tests.conftest import entetes_pour

CreerCompte = Callable[..., Awaitable[Utilisateur]]


@pytest.fixture
async def gestionnaire(creer_compte: CreerCompte) -> Utilisateur:
    return await creer_compte(RoleUtilisateur.GESTIONNAIRE)


@pytest.fixture
async def client_fidele(db_session: AsyncSession) -> Tiers:
    tiers = Tiers(nom="Boutique Awa", telephone="76001122", est_client=True)
    db_session.add(tiers)
    await db_session.flush()
    return tiers


async def article(session: AsyncSession, code: str) -> Article:
    return (await session.execute(select(Article).where(Article.code_sku == code))).scalar_one()


async def compte(session: AsyncSession, code: str) -> CompteTresorerie:
    requete = select(CompteTresorerie).where(CompteTresorerie.code == code)
    return (await session.execute(requete)).scalar_one()


async def approvisionner(
    session: AsyncSession, code: str, quantite: str, cout: str, auteur: Utilisateur
) -> Article:
    """Stock de départ valorisé, comme un inventaire."""
    a = await article(session, code)
    verrouille = (await verrouiller_articles(session, [a.id]))[a.id]
    await ecrire_mouvement_stock(
        session,
        verrouille,
        type_mouvement=TypeMouvementStock.AJUSTEMENT_INVENTAIRE,
        quantite=Decimal(quantite),
        cout_entree=Decimal(cout),
        utilisateur_id=auteur.id,
    )
    await session.commit()
    return a


async def sac_de(
    session: AsyncSession, client: AsyncClient, entetes: dict[str, str], code: str
) -> int:
    a = await article(session, code)
    fiche = (await client.get(f"/api/v1/articles/{a.id}", headers=entetes)).json()
    return int(fiche["unites"][0]["id"])


def vente(lignes: list[dict[str, Any]], **autres: Any) -> dict[str, Any]:
    return {"cle_idempotence": str(uuid.uuid4()), "lignes": lignes, **autres}


# --- US-VTE-01, 02 : vente et encaissement -------------------------------------------


async def test_vente_comptoir_en_sacs_payee_en_especes(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur
) -> None:
    entetes = entetes_pour(gestionnaire)
    soja = await approvisionner(db_session, "MP-SOJ-CON", "500", "250", gestionnaire)
    caisse = await compte(db_session, "CAISSE")
    sac = await sac_de(db_session, client, entetes, "MP-SOJ-CON")

    reponse = await client.post(
        "/api/v1/ventes",
        json=vente(
            [
                {
                    "article_id": str(soja.id),
                    "unite_id": sac,
                    "quantite": "2",
                    "prix_unitaire": "15000",
                }
            ],
            reglements=[{"compte_id": caisse.id, "montant": "30000"}],
        ),
        headers=entetes,
    )

    assert reponse.status_code == 201
    detail = reponse.json()
    assert detail["numero"].startswith("FAC-") and detail["numero"].endswith("-0001")
    assert detail["client"] is None  # client comptoir
    assert (detail["montant_total"], detail["reste_a_payer"]) == ("30000.00", "0.00")
    assert detail["lignes"][0]["quantite_base"] == "100.000"
    await db_session.refresh(soja)
    assert (soja.stock_actuel, soja.cout_moyen) == (Decimal("400.000"), Decimal("250.0000"))
    await db_session.refresh(caisse)
    assert caisse.solde_actuel == Decimal("30000.00")
    ligne = (await db_session.execute(select(LigneVente))).scalar_one()
    assert ligne.cout_unitaire_base == Decimal("250.0000")  # coût moyen copié (marges)
    mouvement = (
        await db_session.execute(
            select(MouvementStock).where(
                MouvementStock.type_mouvement == TypeMouvementStock.SORTIE_VENTE
            )
        )
    ).scalar_one()
    assert (mouvement.quantite, mouvement.reference_document) == (
        Decimal("-100.000"),
        detail["numero"],
    )
    ecriture = (
        await db_session.execute(
            select(TransactionTresorerie).where(
                TransactionTresorerie.type_flux == TypeFluxTresorerie.ENCAISSEMENT_VENTE
            )
        )
    ).scalar_one()
    assert (ecriture.sens, ecriture.montant) == ("CREDIT", Decimal("30000.00"))


async def test_stock_insuffisant_toutes_lignes_additionnees(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur
) -> None:
    mais = await approvisionner(db_session, "MP-MAI", "100", "200", gestionnaire)
    caisse = await compte(db_session, "CAISSE")
    ligne = {"article_id": str(mais.id), "quantite": "60", "prix_unitaire": "300"}

    reponse = await client.post(
        "/api/v1/ventes",
        json=vente([ligne, ligne], reglements=[{"compte_id": caisse.id, "montant": "36000"}]),
        headers=entetes_pour(gestionnaire),
    )

    assert reponse.status_code == 409
    assert reponse.json()["code"] == "STOCK_INSUFFISANT"
    assert "il reste 100 kg, la vente en demande 120 kg" in reponse.json()["message"]
    # En production, get_db ferme la session et annule tout ; on reproduit ce rollback
    await db_session.rollback()
    await db_session.refresh(mais)
    assert mais.stock_actuel == Decimal("100.000")
    assert await db_session.scalar(select(func.count()).select_from(Vente)) == 0


async def test_paiement_mixte_et_creance(
    client: AsyncClient,
    db_session: AsyncSession,
    gestionnaire: Utilisateur,
    client_fidele: Tiers,
) -> None:
    entetes = entetes_pour(gestionnaire)
    mais = await approvisionner(db_session, "MP-MAI", "500", "200", gestionnaire)

    reponse = await client.post(
        "/api/v1/ventes",
        json=vente(
            [{"article_id": str(mais.id), "quantite": "300", "prix_unitaire": "300"}],
            client_id=str(client_fidele.id),
            reglements=[
                {"compte_id": (await compte(db_session, "CAISSE")).id, "montant": "40000"},
                {
                    "compte_id": (await compte(db_session, "WAVE")).id,
                    "montant": "20000",
                    "reference_paiement": "WV-1234",
                },
            ],
        ),
        headers=entetes,
    )

    assert reponse.status_code == 201
    detail = reponse.json()
    assert (detail["client"], detail["reste_a_payer"]) == ("Boutique Awa", "30000.00")
    assert detail["comptes"] == ["Caisse Principale (Espèces)", "Wave"]
    assert detail["client_telephone"] == "76001122"
    fiche = (await client.get(f"/api/v1/tiers/{client_fidele.id}", headers=entetes)).json()
    assert fiche["solde_creance"] == "30000.00"


@pytest.mark.parametrize(
    ("reglements", "code"),
    [([], "CREDIT_SANS_CLIENT"), ("trop", "REGLEMENT_SUPERIEUR")],
)
async def test_ventes_refusees(
    client: AsyncClient,
    db_session: AsyncSession,
    gestionnaire: Utilisateur,
    reglements: Any,
    code: str,
) -> None:
    mais = await approvisionner(db_session, "MP-MAI", "100", "200", gestionnaire)
    if reglements == "trop":
        reglements = [{"compte_id": (await compte(db_session, "CAISSE")).id, "montant": "9000"}]

    reponse = await client.post(
        "/api/v1/ventes",
        json=vente(
            [{"article_id": str(mais.id), "quantite": "10", "prix_unitaire": "300"}],
            client_nom_libre="Passant",
            reglements=reglements,
        ),
        headers=entetes_pour(gestionnaire),
    )

    assert reponse.status_code == 400
    assert reponse.json()["code"] == code


async def test_double_envoi_ne_cree_qu_une_vente(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur
) -> None:
    mais = await approvisionner(db_session, "MP-MAI", "100", "200", gestionnaire)
    caisse = await compte(db_session, "CAISSE")
    corps = vente(
        [{"article_id": str(mais.id), "quantite": "10", "prix_unitaire": "300"}],
        reglements=[{"compte_id": caisse.id, "montant": "3000"}],
    )

    premier = await client.post("/api/v1/ventes", json=corps, headers=entetes_pour(gestionnaire))
    second = await client.post("/api/v1/ventes", json=corps, headers=entetes_pour(gestionnaire))

    assert (premier.status_code, second.status_code) == (201, 200)
    assert premier.json()["id"] == second.json()["id"]
    await db_session.refresh(mais)
    assert mais.stock_actuel == Decimal("90.000")
    await db_session.refresh(caisse)
    assert caisse.solde_actuel == Decimal("3000.00")


# --- US-VTE-05 : encaissement d'une créance ------------------------------------------


async def test_encaissement_d_une_creance(
    client: AsyncClient,
    db_session: AsyncSession,
    gestionnaire: Utilisateur,
    client_fidele: Tiers,
) -> None:
    entetes = entetes_pour(gestionnaire)
    mais = await approvisionner(db_session, "MP-MAI", "100", "200", gestionnaire)
    orange = await compte(db_session, "ORANGE_MONEY")
    creation = await client.post(
        "/api/v1/ventes",
        json=vente(
            [{"article_id": str(mais.id), "quantite": "50", "prix_unitaire": "300"}],
            client_id=str(client_fidele.id),
        ),
        headers=entetes,
    )
    adresse = f"/api/v1/ventes/{creation.json()['id']}/reglements"
    a_encaisser = await client.get("/api/v1/ventes", params={"a_encaisser": True}, headers=entetes)
    assert [v["reste_a_payer"] for v in a_encaisser.json()["items"]] == ["15000.00"]

    trop = await client.post(
        adresse,
        json={"cle_idempotence": str(uuid.uuid4()), "compte_id": orange.id, "montant": "20000"},
        headers=entetes,
    )
    paiement = {
        "cle_idempotence": str(uuid.uuid4()),
        "compte_id": orange.id,
        "montant": "15000",
        "reference_paiement": "OM-998",
    }
    solde = await client.post(adresse, json=paiement, headers=entetes)
    rejeu = await client.post(adresse, json=paiement, headers=entetes)
    encore = await client.post(
        adresse,
        json={"cle_idempotence": str(uuid.uuid4()), "compte_id": orange.id, "montant": "1"},
        headers=entetes,
    )

    assert trop.status_code == 400 and trop.json()["code"] == "MONTANT_SUPERIEUR_AU_RESTE"
    assert solde.status_code == 200 and solde.json()["reste_a_payer"] == "0.00"
    assert len(rejeu.json()["reglements"]) == 1
    assert encore.status_code == 409 and encore.json()["code"] == "VENTE_SOLDEE"
    await db_session.refresh(orange)
    assert orange.solde_actuel == Decimal("15000.00")
    fiche = (await client.get(f"/api/v1/tiers/{client_fidele.id}", headers=entetes)).json()
    assert fiche["solde_creance"] == "0.00"


# --- US-VTE-04 : dons et échantillons ------------------------------------------------


async def test_don_sort_le_stock_sans_argent(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur
) -> None:
    entetes = entetes_pour(gestionnaire)
    mais = await approvisionner(db_session, "MP-MAI", "100", "200", gestionnaire)

    reponse = await client.post(
        "/api/v1/ventes/dons",
        json={
            "cle_idempotence": str(uuid.uuid4()),
            "beneficiaire": "École de Kati",
            "motif": "Dégustation",
            "lignes": [{"article_id": str(mais.id), "quantite": "5"}],
        },
        headers=entetes,
    )
    sans_motif = await client.post(
        "/api/v1/ventes/dons",
        json={
            "cle_idempotence": str(uuid.uuid4()),
            "beneficiaire": "École de Kati",
            "lignes": [{"article_id": str(mais.id), "quantite": "5"}],
        },
        headers=entetes,
    )

    assert reponse.status_code == 201
    don = reponse.json()
    assert don["numero"].startswith("DON-") and don["est_don"] is True
    assert (don["client"], don["motif_don"], don["montant_total"]) == (
        "École de Kati",
        "Dégustation",
        "0.00",
    )
    assert don["reste_a_payer"] == "0.00"
    assert sans_motif.status_code == 422
    await db_session.refresh(mais)
    assert mais.stock_actuel == Decimal("95.000")
    mouvement = (
        await db_session.execute(
            select(MouvementStock).where(
                MouvementStock.type_mouvement == TypeMouvementStock.SORTIE_DON
            )
        )
    ).scalar_one()
    assert mouvement.motif == "Dégustation — École de Kati"
    assert await db_session.scalar(select(func.count()).select_from(TransactionTresorerie)) == 0
    dons = await client.get("/api/v1/ventes", params={"type": "dons"}, headers=entetes)
    ventes = await client.get("/api/v1/ventes", params={"type": "ventes"}, headers=entetes)
    assert (dons.json()["total"], ventes.json()["total"]) == (1, 0)


# --- US-VTE-06 : annulation ----------------------------------------------------------


async def test_annulation_remet_le_stock_et_reprend_l_argent(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur
) -> None:
    entetes = entetes_pour(gestionnaire)
    mais = await approvisionner(db_session, "MP-MAI", "100", "200", gestionnaire)
    caisse = await compte(db_session, "CAISSE")
    creation = await client.post(
        "/api/v1/ventes",
        json=vente(
            [{"article_id": str(mais.id), "quantite": "40", "prix_unitaire": "300"}],
            reglements=[{"compte_id": caisse.id, "montant": "12000"}],
        ),
        headers=entetes,
    )
    # Entre-temps, un achat plus cher fait monter le coût moyen
    a = (await verrouiller_articles(db_session, [mais.id]))[mais.id]
    await ecrire_mouvement_stock(
        db_session,
        a,
        type_mouvement=TypeMouvementStock.ENTREE_ACHAT,
        quantite=Decimal(60),
        cout_entree=Decimal(300),
        utilisateur_id=gestionnaire.id,
    )
    await db_session.commit()
    adresse = f"/api/v1/ventes/{creation.json()['id']}/annuler"

    annulation = await client.post(adresse, json={"motif": "Erreur de client"}, headers=entetes)
    encore = await client.post(adresse, json={"motif": "Encore"}, headers=entetes)

    assert annulation.status_code == 200
    detail = annulation.json()
    assert detail["statut"] == "ANNULE" and detail["numero"] == creation.json()["numero"]
    assert detail["reglements"][0]["statut"] == "ANNULE"
    assert encore.status_code == 409 and "déjà annulée" in encore.json()["message"]
    await db_session.refresh(mais)
    # 60 kg à 200 + 60 kg à 300, puis 40 kg rendus à 200 : (12000 + 18000 + 8000) / 160
    assert (mais.stock_actuel, mais.cout_moyen) == (Decimal("160.000"), Decimal("237.5000"))
    await db_session.refresh(caisse)
    assert caisse.solde_actuel == Decimal("0.00")
    contre = (
        await db_session.execute(
            select(TransactionTresorerie).where(
                TransactionTresorerie.type_flux == TypeFluxTresorerie.ANNULATION
            )
        )
    ).scalar_one()
    assert (contre.sens, contre.montant) == ("DEBIT", Decimal("12000.00"))


async def test_annulation_refusee_si_la_caisse_n_a_plus_l_argent(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur
) -> None:
    entetes = entetes_pour(gestionnaire)
    mais = await approvisionner(db_session, "MP-MAI", "100", "200", gestionnaire)
    caisse = await compte(db_session, "CAISSE")
    creation = await client.post(
        "/api/v1/ventes",
        json=vente(
            [{"article_id": str(mais.id), "quantite": "40", "prix_unitaire": "300"}],
            reglements=[{"compte_id": caisse.id, "montant": "12000"}],
        ),
        headers=entetes,
    )
    # L'argent a déjà quitté la caisse (dépense, versement en banque…)
    verrouille = await verrouiller_compte(db_session, caisse.id)
    await ecrire_mouvement_tresorerie(
        db_session,
        verrouille,
        type_flux=TypeFluxTresorerie.TRANSFERT_INTERNE,
        sens="DEBIT",
        montant=Decimal(10000),
        libelle="Versement en banque",
        utilisateur_id=gestionnaire.id,
    )
    await db_session.commit()

    reponse = await client.post(
        f"/api/v1/ventes/{creation.json()['id']}/annuler", json={"motif": "Erreur"}, headers=entetes
    )

    assert reponse.status_code == 409
    assert reponse.json()["code"] == "SOLDE_INSUFFISANT"
    await db_session.rollback()
    await db_session.refresh(mais)
    assert mais.stock_actuel == Decimal("60.000")  # rien n'a été remis en stock


# --- Droits et consultation ----------------------------------------------------------


@pytest.mark.parametrize("role", [RoleUtilisateur.SUPER_ADMIN, RoleUtilisateur.CONSULTANT])
async def test_ventes_saisies_par_le_gestionnaire(
    client: AsyncClient, db_session: AsyncSession, creer_compte: CreerCompte, role: RoleUtilisateur
) -> None:
    utilisateur = await creer_compte(role)
    mais = await article(db_session, "MP-MAI")
    entetes = entetes_pour(utilisateur)

    creation = await client.post(
        "/api/v1/ventes",
        json=vente([{"article_id": str(mais.id), "quantite": "1", "prix_unitaire": "300"}]),
        headers=entetes,
    )
    don = await client.post(
        "/api/v1/ventes/dons",
        json={
            "cle_idempotence": str(uuid.uuid4()),
            "beneficiaire": "X",
            "motif": "Essai",
            "lignes": [{"article_id": str(mais.id), "quantite": "1"}],
        },
        headers=entetes,
    )
    lecture = await client.get("/api/v1/ventes", headers=entetes)
    entreprise = await client.get("/api/v1/entreprise", headers=entetes)

    assert (creation.status_code, don.status_code) == (403, 403)
    assert lecture.status_code == 200
    assert entreprise.status_code == 200 and entreprise.json()["nom"] == "Keitala"
