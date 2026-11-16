"""Sprint 4 : achats (US-ACH-01 à 04), règles 1 à 6, P-009 (idempotence), P-010."""

import uuid
from collections.abc import Awaitable, Callable
from decimal import Decimal
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Achat,
    Article,
    CompteTresorerie,
    MouvementStock,
    Reglement,
    Tiers,
    TransactionTresorerie,
    Utilisateur,
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
async def fournisseur(db_session: AsyncSession) -> Tiers:
    tiers = Tiers(nom="Coopérative de Ségou", est_fournisseur=True)
    db_session.add(tiers)
    await db_session.flush()
    return tiers


async def article(session: AsyncSession, code: str) -> Article:
    return (await session.execute(select(Article).where(Article.code_sku == code))).scalar_one()


async def compte(session: AsyncSession, code: str) -> CompteTresorerie:
    requete = select(CompteTresorerie).where(CompteTresorerie.code == code)
    return (await session.execute(requete)).scalar_one()


async def alimenter(session: AsyncSession, code: str, montant: str, auteur: Utilisateur) -> None:
    """Solde d'ouverture, pour pouvoir payer depuis la caisse ou un compte Mobile Money."""
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


async def sac_de(client: AsyncClient, entetes: dict[str, str], article_id: uuid.UUID) -> int:
    fiche = (await client.get(f"/api/v1/articles/{article_id}", headers=entetes)).json()
    return int(fiche["unites"][0]["id"])


def achat(lignes: list[dict[str, Any]], **autres: Any) -> dict[str, Any]:
    return {"cle_idempotence": str(uuid.uuid4()), "lignes": lignes, **autres}


# --- US-ACH-01 : enregistrement ------------------------------------------------------


async def test_achat_comptant_en_sacs(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur
) -> None:
    entetes = entetes_pour(gestionnaire)
    await alimenter(db_session, "CAISSE", "100000", gestionnaire)
    soja = await article(db_session, "MP-SOJ-CON")
    caisse = await compte(db_session, "CAISSE")
    sac = await sac_de(client, entetes, soja.id)

    reponse = await client.post(
        "/api/v1/achats",
        json=achat(
            [
                {
                    "article_id": str(soja.id),
                    "unite_id": sac,
                    "quantite": "3",
                    "prix_unitaire": "12500",
                }
            ],
            fournisseur_nom_libre="Marché de Niono",
            numero_facture_fournisseur="BL-42",
            reglements=[{"compte_id": caisse.id, "montant": "37500"}],
        ),
        headers=entetes,
    )

    assert reponse.status_code == 201
    detail = reponse.json()
    assert detail["numero"].startswith("ACH-") and detail["numero"].endswith("-0001")
    assert detail["fournisseur"] == "Marché de Niono"
    assert (detail["montant_total"], detail["montant_regle"], detail["reste_a_payer"]) == (
        "37500.00",
        "37500.00",
        "0.00",
    )
    assert detail["comptes"] == ["Caisse Principale (Espèces)"]
    ligne = detail["lignes"][0]
    assert (ligne["unite"], ligne["quantite_base"]) == ("Sac 50 kg", "150.000")
    # Stock en kg, coût moyen au kg (12 500 ÷ 50)
    await db_session.refresh(soja)
    assert (soja.stock_actuel, soja.cout_moyen) == (Decimal("150.000"), Decimal("250.0000"))
    await db_session.refresh(caisse)
    assert caisse.solde_actuel == Decimal("62500.00")
    ecriture = (
        await db_session.execute(
            select(TransactionTresorerie).where(
                TransactionTresorerie.type_flux == TypeFluxTresorerie.DECAISSEMENT_ACHAT
            )
        )
    ).scalar_one()
    assert (ecriture.sens, ecriture.montant) == ("DEBIT", Decimal("37500.00"))
    mouvement = (
        await db_session.execute(select(MouvementStock).where(MouvementStock.article_id == soja.id))
    ).scalar_one()
    assert mouvement.type_mouvement == TypeMouvementStock.ENTREE_ACHAT
    assert mouvement.reference_document == detail["numero"]


async def test_paiement_mixte_et_credit(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur, fournisseur: Tiers
) -> None:
    entetes = entetes_pour(gestionnaire)
    await alimenter(db_session, "CAISSE", "50000", gestionnaire)
    await alimenter(db_session, "WAVE", "50000", gestionnaire)
    mais = await article(db_session, "MP-MAI")

    reponse = await client.post(
        "/api/v1/achats",
        json=achat(
            [{"article_id": str(mais.id), "quantite": "400", "prix_unitaire": "250"}],
            fournisseur_id=str(fournisseur.id),
            reglements=[
                {"compte_id": (await compte(db_session, "CAISSE")).id, "montant": "30000"},
                {
                    "compte_id": (await compte(db_session, "WAVE")).id,
                    "montant": "20000",
                    "reference_paiement": "WV-778812",
                },
            ],
        ),
        headers=entetes,
    )

    assert reponse.status_code == 201
    assert reponse.json()["reste_a_payer"] == "50000.00"
    assert reponse.json()["comptes"] == ["Caisse Principale (Espèces)", "Wave"]
    fiche = (await client.get(f"/api/v1/tiers/{fournisseur.id}", headers=entetes)).json()
    assert fiche["solde_dette"] == "50000.00"


@pytest.mark.parametrize(
    ("autres", "code"),
    [
        ({}, "CREDIT_SANS_FOURNISSEUR"),  # rien de payé, pas de fournisseur
        ({"reglements": "trop"}, "REGLEMENT_SUPERIEUR"),
    ],
)
async def test_achats_refuses(
    client: AsyncClient,
    db_session: AsyncSession,
    gestionnaire: Utilisateur,
    autres: dict[str, Any],
    code: str,
) -> None:
    await alimenter(db_session, "CAISSE", "100000", gestionnaire)
    mais = await article(db_session, "MP-MAI")
    if autres.get("reglements") == "trop":
        caisse = await compte(db_session, "CAISSE")
        autres = {"reglements": [{"compte_id": caisse.id, "montant": "30000"}]}

    reponse = await client.post(
        "/api/v1/achats",
        json=achat(
            [{"article_id": str(mais.id), "quantite": "100", "prix_unitaire": "250"}], **autres
        ),
        headers=entetes_pour(gestionnaire),
    )

    assert reponse.status_code == 400
    assert reponse.json()["code"] == code


async def test_solde_insuffisant_rien_n_est_ecrit(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur
) -> None:
    await alimenter(db_session, "CAISSE", "10000", gestionnaire)
    mais = await article(db_session, "MP-MAI")
    caisse = await compte(db_session, "CAISSE")

    reponse = await client.post(
        "/api/v1/achats",
        json=achat(
            [{"article_id": str(mais.id), "quantite": "100", "prix_unitaire": "250"}],
            reglements=[{"compte_id": caisse.id, "montant": "25000"}],
        ),
        headers=entetes_pour(gestionnaire),
    )

    assert reponse.status_code == 409
    assert reponse.json()["code"] == "SOLDE_INSUFFISANT"
    # Règle 3 : une opération = une transaction ; rien n'a été écrit
    # En production, get_db ferme la session et annule tout ; on reproduit ce rollback
    await db_session.rollback()
    await db_session.refresh(mais)
    assert mais.stock_actuel == Decimal("0.000")
    assert await db_session.scalar(select(func.count()).select_from(Achat)) == 0
    assert await db_session.scalar(select(func.count()).select_from(MouvementStock)) == 0


async def test_double_envoi_ne_cree_qu_un_achat(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur
) -> None:
    await alimenter(db_session, "CAISSE", "100000", gestionnaire)
    mais = await article(db_session, "MP-MAI")
    caisse = await compte(db_session, "CAISSE")
    corps = achat(
        [{"article_id": str(mais.id), "quantite": "100", "prix_unitaire": "250"}],
        reglements=[{"compte_id": caisse.id, "montant": "25000"}],
    )

    premier = await client.post("/api/v1/achats", json=corps, headers=entetes_pour(gestionnaire))
    second = await client.post("/api/v1/achats", json=corps, headers=entetes_pour(gestionnaire))

    assert (premier.status_code, second.status_code) == (201, 200)
    assert premier.json()["id"] == second.json()["id"]
    assert await db_session.scalar(select(func.count()).select_from(Achat)) == 1
    await db_session.refresh(mais)
    assert mais.stock_actuel == Decimal("100.000")
    await db_session.refresh(caisse)
    assert caisse.solde_actuel == Decimal("75000.00")


async def test_cout_moyen_pondere_a_l_achat(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur, fournisseur: Tiers
) -> None:
    mil = await article(db_session, "MP-MIL")
    a = (await verrouiller_articles(db_session, [mil.id]))[mil.id]
    await ecrire_mouvement_stock(
        db_session,
        a,
        type_mouvement=TypeMouvementStock.AJUSTEMENT_INVENTAIRE,
        quantite=Decimal(100),
        cout_entree=Decimal(250),
        utilisateur_id=gestionnaire.id,
    )
    await db_session.flush()

    await client.post(
        "/api/v1/achats",
        json=achat(
            [{"article_id": str(mil.id), "quantite": "50", "prix_unitaire": "400"}],
            fournisseur_id=str(fournisseur.id),
        ),
        headers=entetes_pour(gestionnaire),
    )

    await db_session.refresh(mil)
    assert (mil.stock_actuel, mil.cout_moyen) == (Decimal("150.000"), Decimal("300.0000"))


# --- US-ACH-03 : paiement d'une dette ------------------------------------------------


async def test_paiement_d_une_dette(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur, fournisseur: Tiers
) -> None:
    entetes = entetes_pour(gestionnaire)
    await alimenter(db_session, "CAISSE", "200000", gestionnaire)
    caisse = await compte(db_session, "CAISSE")
    mais = await article(db_session, "MP-MAI")
    creation = await client.post(
        "/api/v1/achats",
        json=achat(
            [{"article_id": str(mais.id), "quantite": "200", "prix_unitaire": "250"}],
            fournisseur_id=str(fournisseur.id),
        ),
        headers=entetes,
    )
    adresse = f"/api/v1/achats/{creation.json()['id']}/reglements"
    a_payer = await client.get("/api/v1/achats", params={"a_payer": True}, headers=entetes)
    assert [a["reste_a_payer"] for a in a_payer.json()["items"]] == ["50000.00"]

    trop = await client.post(
        adresse,
        json={"cle_idempotence": str(uuid.uuid4()), "compte_id": caisse.id, "montant": "60000"},
        headers=entetes,
    )
    paiement = {"cle_idempotence": str(uuid.uuid4()), "compte_id": caisse.id, "montant": "50000"}
    solde = await client.post(adresse, json=paiement, headers=entetes)
    rejeu = await client.post(adresse, json=paiement, headers=entetes)
    encore = await client.post(
        adresse,
        json={"cle_idempotence": str(uuid.uuid4()), "compte_id": caisse.id, "montant": "1"},
        headers=entetes,
    )

    assert trop.status_code == 400 and trop.json()["code"] == "MONTANT_SUPERIEUR_AU_RESTE"
    assert "50 000 FCFA" in trop.json()["message"]
    assert solde.status_code == 200 and solde.json()["reste_a_payer"] == "0.00"
    assert rejeu.status_code == 200
    assert len(rejeu.json()["reglements"]) == 1  # le second envoi n'a rien ajouté
    assert encore.status_code == 409 and encore.json()["code"] == "ACHAT_SOLDE"
    await db_session.refresh(caisse)
    assert caisse.solde_actuel == Decimal("150000.00")
    a_payer = await client.get("/api/v1/achats", params={"a_payer": True}, headers=entetes)
    assert a_payer.json()["total"] == 0


# --- US-ACH-04 : annulation (P-010) --------------------------------------------------


async def test_annulation_contre_passe_stock_et_paiements(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur
) -> None:
    entetes = entetes_pour(gestionnaire)
    await alimenter(db_session, "CAISSE", "100000", gestionnaire)
    soja = await article(db_session, "MP-SOJ-CON")
    caisse = await compte(db_session, "CAISSE")
    creation = await client.post(
        "/api/v1/achats",
        json=achat(
            [
                {
                    "article_id": str(soja.id),
                    "unite_id": await sac_de(client, entetes, soja.id),
                    "quantite": "3",
                    "prix_unitaire": "12500",
                }
            ],
            reglements=[{"compte_id": caisse.id, "montant": "37500"}],
        ),
        headers=entetes,
    )
    adresse = f"/api/v1/achats/{creation.json()['id']}/annuler"

    annulation = await client.post(adresse, json={"motif": "Saisi deux fois"}, headers=entetes)
    encore = await client.post(adresse, json={"motif": "Encore"}, headers=entetes)

    assert annulation.status_code == 200
    detail = annulation.json()
    assert detail["statut"] == "ANNULE" and detail["motif_annulation"] == "Saisi deux fois"
    assert detail["reglements"][0]["statut"] == "ANNULE"
    assert detail["reste_a_payer"] == "0" or detail["reste_a_payer"] == "0.00"
    assert encore.status_code == 409
    await db_session.refresh(soja)
    assert soja.stock_actuel == Decimal("0.000")
    await db_session.refresh(caisse)
    assert caisse.solde_actuel == Decimal("100000.00")  # l'argent est revenu
    contre = (
        await db_session.execute(
            select(TransactionTresorerie).where(
                TransactionTresorerie.type_flux == TypeFluxTresorerie.ANNULATION
            )
        )
    ).scalar_one()
    assert (contre.sens, contre.montant) == ("CREDIT", Decimal("37500.00"))
    # Rien n'est supprimé : l'achat reste dans l'historique, ses règlements aussi
    liste = await client.get("/api/v1/achats", headers=entetes)
    assert liste.json()["items"][0]["statut"] == "ANNULE"
    assert await db_session.scalar(select(func.count()).select_from(Reglement)) == 1


async def test_annulation_retablit_le_cout_moyen(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur, fournisseur: Tiers
) -> None:
    entetes = entetes_pour(gestionnaire)
    mil = await article(db_session, "MP-MIL")
    a = (await verrouiller_articles(db_session, [mil.id]))[mil.id]
    await ecrire_mouvement_stock(
        db_session,
        a,
        type_mouvement=TypeMouvementStock.AJUSTEMENT_INVENTAIRE,
        quantite=Decimal(100),
        cout_entree=Decimal(250),
        utilisateur_id=gestionnaire.id,
    )
    await db_session.flush()
    creation = await client.post(
        "/api/v1/achats",
        json=achat(
            [{"article_id": str(mil.id), "quantite": "50", "prix_unitaire": "400"}],
            fournisseur_id=str(fournisseur.id),
        ),
        headers=entetes,
    )
    await db_session.refresh(mil)
    assert mil.cout_moyen == Decimal("300.0000")

    await client.post(
        f"/api/v1/achats/{creation.json()['id']}/annuler", json={"motif": "Erreur"}, headers=entetes
    )

    await db_session.refresh(mil)
    assert (mil.stock_actuel, mil.cout_moyen) == (Decimal("100.000"), Decimal("250.0000"))


async def test_annulation_refusee_si_le_stock_a_ete_vendu(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur, fournisseur: Tiers
) -> None:
    entetes = entetes_pour(gestionnaire)
    mais = await article(db_session, "MP-MAI")
    creation = await client.post(
        "/api/v1/achats",
        json=achat(
            [{"article_id": str(mais.id), "quantite": "150", "prix_unitaire": "250"}],
            fournisseur_id=str(fournisseur.id),
        ),
        headers=entetes,
    )
    a = (await verrouiller_articles(db_session, [mais.id]))[mais.id]
    await ecrire_mouvement_stock(
        db_session,
        a,
        type_mouvement=TypeMouvementStock.SORTIE_VENTE,
        quantite=Decimal(-100),
        utilisateur_id=gestionnaire.id,
    )
    await db_session.flush()

    reponse = await client.post(
        f"/api/v1/achats/{creation.json()['id']}/annuler", json={"motif": "Erreur"}, headers=entetes
    )

    assert reponse.status_code == 409
    assert reponse.json()["code"] == "ANNULATION_IMPOSSIBLE"
    assert "il reste 50 kg de Maïs" in reponse.json()["message"]
    await db_session.refresh(mais)
    assert mais.stock_actuel == Decimal("50.000")


# --- Droits et consultation (US-ACH-02) ----------------------------------------------


@pytest.mark.parametrize("role", [RoleUtilisateur.SUPER_ADMIN, RoleUtilisateur.CONSULTANT])
async def test_achats_saisis_par_le_gestionnaire(
    client: AsyncClient, db_session: AsyncSession, creer_compte: CreerCompte, role: RoleUtilisateur
) -> None:
    utilisateur = await creer_compte(role)
    mais = await article(db_session, "MP-MAI")

    creation = await client.post(
        "/api/v1/achats",
        json=achat([{"article_id": str(mais.id), "quantite": "1", "prix_unitaire": "250"}]),
        headers=entetes_pour(utilisateur),
    )
    lecture = await client.get("/api/v1/achats", headers=entetes_pour(utilisateur))

    assert creation.status_code == 403
    assert lecture.status_code == 200


async def test_filtres_de_l_historique(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur, fournisseur: Tiers
) -> None:
    entetes = entetes_pour(gestionnaire)
    mais = await article(db_session, "MP-MAI")
    for _ in range(2):
        await client.post(
            "/api/v1/achats",
            json=achat(
                [{"article_id": str(mais.id), "quantite": "10", "prix_unitaire": "250"}],
                fournisseur_id=str(fournisseur.id),
            ),
            headers=entetes,
        )

    par_fournisseur = await client.get(
        "/api/v1/achats", params={"fournisseur_id": str(fournisseur.id)}, headers=entetes
    )
    par_nom = await client.get("/api/v1/achats", params={"recherche": "segou"}, headers=entetes)
    futur = await client.get("/api/v1/achats", params={"du": "2999-01-01"}, headers=entetes)

    assert par_fournisseur.json()["total"] == 2
    assert par_nom.json()["total"] == 2
    assert par_nom.json()["items"][0]["fournisseur"] == "Coopérative de Ségou"
    assert futur.json()["total"] == 0


async def test_montant_arrondi_au_franc_et_soldable(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur
) -> None:
    """P-019 : 1,5 kg à 333 FCFA = 499,5 → 500 FCFA, payable en francs entiers."""
    await alimenter(db_session, "CAISSE", "1000", gestionnaire)
    mais = await article(db_session, "MP-MAI")
    caisse = await compte(db_session, "CAISSE")

    reponse = await client.post(
        "/api/v1/achats",
        json=achat(
            [{"article_id": str(mais.id), "quantite": "1.5", "prix_unitaire": "333"}],
            reglements=[{"compte_id": caisse.id, "montant": "500"}],
        ),
        headers=entetes_pour(gestionnaire),
    )

    assert reponse.status_code == 201
    detail = reponse.json()
    assert (detail["montant_total"], detail["lignes"][0]["montant_total"]) == ("500.00", "500.00")
    assert detail["reste_a_payer"] == "0.00"
