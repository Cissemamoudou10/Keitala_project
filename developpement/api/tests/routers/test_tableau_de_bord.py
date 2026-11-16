"""Sprint 8 : tableau de bord, marges, exports Excel (US-DASH-01 à 03)."""

import io
import uuid
import zipfile
from collections.abc import Awaitable, Callable
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.excel import classeur
from app.models import Article, CompteTresorerie, Tiers, Utilisateur
from app.models.enums import RoleUtilisateur, TypeMouvementStock
from app.services.stocks import ecrire_mouvement_stock, verrouiller_articles
from tests.conftest import entetes_pour

CreerCompte = Callable[..., Awaitable[Utilisateur]]
FICHIERS = {
    "stocks": "etat-des-stocks",
    "journal": "journal-tresorerie",
    "ventes": "ventes",
    "marges": "marges",
}


@pytest.fixture
async def gestionnaire(creer_compte: CreerCompte) -> Utilisateur:
    return await creer_compte(RoleUtilisateur.GESTIONNAIRE)


async def article(session: AsyncSession, code: str) -> Article:
    return (await session.execute(select(Article).where(Article.code_sku == code))).scalar_one()


async def compte(session: AsyncSession, code: str) -> CompteTresorerie:
    requete = select(CompteTresorerie).where(CompteTresorerie.code == code)
    return (await session.execute(requete)).scalar_one()


async def approvisionner(
    session: AsyncSession, code: str, quantite: str, cout: str, auteur: Utilisateur
) -> Article:
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


async def vendre(
    client: AsyncClient,
    entetes: dict[str, str],
    article_id: uuid.UUID,
    quantite: str,
    prix: str,
    **autres: object,
) -> dict[str, object]:
    reponse = await client.post(
        "/api/v1/ventes",
        json={
            "cle_idempotence": str(uuid.uuid4()),
            "lignes": [
                {"article_id": str(article_id), "quantite": quantite, "prix_unitaire": prix}
            ],
            **autres,
        },
        headers=entetes,
    )
    assert reponse.status_code == 201, reponse.text
    return dict(reponse.json())


async def test_indicateurs_du_tableau_de_bord(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur
) -> None:
    entetes = entetes_pour(gestionnaire)
    mais = await approvisionner(db_session, "MP-MAI", "500", "200", gestionnaire)
    caisse = await compte(db_session, "CAISSE")
    boutique = Tiers(nom="Boutique Awa", est_client=True)
    db_session.add(boutique)
    await db_session.commit()
    await vendre(
        client,
        entetes,
        mais.id,
        "100",
        "300",
        reglements=[{"compte_id": caisse.id, "montant": "30000"}],
    )
    credit = await vendre(client, entetes, mais.id, "50", "300", client_id=str(boutique.id))

    reponse = await client.get("/api/v1/tableau-de-bord/indicateurs", headers=entetes)

    assert reponse.status_code == 200
    donnees = reponse.json()
    assert (donnees["ca_jour"], donnees["ca_mois"]) == ("45000.00", "45000.00")
    assert donnees["total_creances"] == "15000.00"
    assert len(donnees["ventes_30_jours"]) == 30
    assert donnees["ventes_30_jours"][-1]["montant"] == "45000.00"
    assert donnees["ventes_30_jours"][0]["montant"] == "0"
    assert [i["numero"] for i in donnees["impayes_anciens"]] == [credit["numero"]]
    assert donnees["impayes_anciens"][0]["client"] == "Boutique Awa"
    assert donnees["ordres_en_cours"] == 0
    caisse_lue = next(c for c in donnees["comptes"] if c["id"] == caisse.id)
    assert caisse_lue["solde"] == "30000.00"
    # 350 kg à 200 FCFA restent en stock
    assert Decimal(donnees["valeur_stock"]) >= Decimal("70000")


async def test_marges_par_article_hors_dons_et_annulations(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur
) -> None:
    entetes = entetes_pour(gestionnaire)
    mais = await approvisionner(db_session, "MP-MAI", "500", "250", gestionnaire)
    caisse = await compte(db_session, "CAISSE")
    await vendre(
        client,
        entetes,
        mais.id,
        "100",
        "300",
        reglements=[{"compte_id": caisse.id, "montant": "30000"}],
    )
    annulee = await vendre(
        client,
        entetes,
        mais.id,
        "10",
        "300",
        reglements=[{"compte_id": caisse.id, "montant": "3000"}],
    )
    await client.post(
        f"/api/v1/ventes/{annulee['id']}/annuler", json={"motif": "Erreur"}, headers=entetes
    )
    await client.post(
        "/api/v1/ventes/dons",
        json={
            "cle_idempotence": str(uuid.uuid4()),
            "beneficiaire": "École",
            "motif": "Dégustation",
            "lignes": [{"article_id": str(mais.id), "quantite": "5"}],
        },
        headers=entetes,
    )

    rapport = (await client.get("/api/v1/tableau-de-bord/marges", headers=entetes)).json()
    futur = await client.get(
        "/api/v1/tableau-de-bord/marges", params={"du": "2999-01-01"}, headers=entetes
    )

    assert [m["article"]["code_sku"] for m in rapport["articles"]] == ["MP-MAI"]
    ligne = rapport["articles"][0]
    assert (ligne["quantite_vendue"], ligne["chiffre_affaires"]) == ("100.000", "30000.00")
    assert (ligne["cout_de_revient"], ligne["marge"], ligne["taux_marge"]) == (
        "25000.00",
        "5000.00",
        "16.7",
    )
    assert futur.json()["articles"] == [] and futur.json()["taux_marge"] is None


def _cellules(contenu: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(contenu)) as archive:
        assert "xl/workbook.xml" in archive.namelist()
        return archive.read("xl/worksheets/sheet1.xml").decode()


async def test_exports_excel_lisibles_par_tous(
    client: AsyncClient,
    db_session: AsyncSession,
    gestionnaire: Utilisateur,
    creer_compte: CreerCompte,
) -> None:
    mais = await approvisionner(db_session, "MP-MAI", "100", "200", gestionnaire)
    caisse = await compte(db_session, "CAISSE")
    vente = await vendre(
        client,
        entetes_pour(gestionnaire),
        mais.id,
        "10",
        "300",
        reglements=[{"compte_id": caisse.id, "montant": "3000"}],
    )
    entetes = entetes_pour(await creer_compte(RoleUtilisateur.CONSULTANT))

    reponses = {
        nom: await client.get(f"/api/v1/exports/{nom}.xlsx", headers=entetes)
        for nom in ("stocks", "journal", "ventes", "marges")
    }

    for nom, reponse in reponses.items():
        assert reponse.status_code == 200, nom
        assert reponse.headers["content-type"].startswith(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        assert f'filename="{FICHIERS[nom]}-' in reponse.headers["content-disposition"]
    assert "MP-MAI" in _cellules(reponses["stocks"].content)
    assert str(vente["numero"]) in _cellules(reponses["ventes"].content)
    assert "Encaissement" not in _cellules(reponses["journal"].content)
    assert f"Vente {vente['numero']}" in _cellules(reponses["journal"].content)


def test_classeur_echappe_le_texte_et_garde_les_nombres() -> None:
    contenu = _cellules(
        classeur(
            "Essai",
            ["Article", "Montant"],
            [["Riz & mil <bio>", Decimal("2030000")], ["Gari", Decimal("1.5")]],
        )
    )

    assert "Riz &amp; mil &lt;bio&gt;" in contenu
    assert '<c r="B2" s="2"><v>2030000</v></c>' in contenu
    assert '<c r="B3" s="3"><v>1.5</v></c>' in contenu
    assert '<c r="A1" t="inlineStr" s="1">' in contenu
