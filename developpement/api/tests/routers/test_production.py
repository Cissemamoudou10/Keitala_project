"""Sprint 7 : recettes et ordres de fabrication (US-PROD-01 à 04, règle 8)."""

from collections.abc import Awaitable, Callable
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Article, MouvementStock, Utilisateur
from app.models.enums import FamilleArticle, RoleUtilisateur, TypeMouvementStock
from app.services.stocks import ecrire_mouvement_stock, verrouiller_articles
from tests.conftest import entetes_pour

CreerCompte = Callable[..., Awaitable[Utilisateur]]


@pytest.fixture
async def gestionnaire(creer_compte: CreerCompte) -> Utilisateur:
    return await creer_compte(RoleUtilisateur.GESTIONNAIRE)


async def nouvel_article(
    session: AsyncSession, code: str, famille: FamilleArticle, unite: str = "kg"
) -> Article:
    article = Article(code_sku=code, designation=code.title(), famille=famille, unite_base=unite)
    session.add(article)
    await session.flush()
    return article


async def approvisionner(
    session: AsyncSession, article: Article, quantite: str, cout: str, auteur: Utilisateur
) -> None:
    verrouille = (await verrouiller_articles(session, [article.id]))[article.id]
    await ecrire_mouvement_stock(
        session,
        verrouille,
        type_mouvement=TypeMouvementStock.AJUSTEMENT_INVENTAIRE,
        quantite=Decimal(quantite),
        cout_entree=Decimal(cout),
        utilisateur_id=auteur.id,
    )
    await session.commit()


@pytest.fixture
async def atelier(db_session: AsyncSession, gestionnaire: Utilisateur) -> dict[str, Article]:
    """Manioc → attiéké vrac (transformation), puis attiéké vrac + sachet → Attiéké 500 g."""
    manioc = await nouvel_article(db_session, "MANIOC", FamilleArticle.MATIERE_PREMIERE)
    vrac = await nouvel_article(db_session, "ATTIEKE-VRAC", FamilleArticle.SEMI_FINI)
    gros = await nouvel_article(db_session, "ATTIEKE-GROS", FamilleArticle.SEMI_FINI)
    sachet = await nouvel_article(db_session, "SACHET-500", FamilleArticle.EMBALLAGE, "sachet")
    fini = await nouvel_article(db_session, "ATTIEKE-500", FamilleArticle.PRODUIT_FINI, "sachet")
    await approvisionner(db_session, manioc, "300", "150", gestionnaire)
    await approvisionner(db_session, sachet, "1000", "25", gestionnaire)
    return {"manioc": manioc, "vrac": vrac, "gros": gros, "sachet": sachet, "fini": fini}


def recette_transformation(atelier: dict[str, Article]) -> dict[str, object]:
    return {
        "type_of": "TRANSFORMATION",
        "article_produit_id": str(atelier["vrac"].id),
        "nom_recette": "Attiéké vrac",
        "quantite_base_produite": "100",
        "composants": [{"article_id": str(atelier["manioc"].id), "quantite": "250"}],
    }


# --- US-PROD-01 : recettes -----------------------------------------------------------


async def test_recette_creee_puis_modifiee(
    client: AsyncClient, gestionnaire: Utilisateur, atelier: dict[str, Article]
) -> None:
    entetes = entetes_pour(gestionnaire)
    creation = await client.post(
        "/api/v1/production/recettes", json=recette_transformation(atelier), headers=entetes
    )
    assert creation.status_code == 201
    recette = creation.json()
    assert (recette["produit"]["code_sku"], recette["composants"][0]["quantite"]) == (
        "ATTIEKE-VRAC",
        "250.0000",
    )

    modification = await client.put(
        f"/api/v1/production/recettes/{recette['id']}",
        json={**recette_transformation(atelier), "nom_recette": "Attiéké vrac (fermenté)"},
        headers=entetes,
    )
    assert modification.json()["nom_recette"] == "Attiéké vrac (fermenté)"


@pytest.mark.parametrize(
    ("changement", "code"),
    [
        ({"article_produit_id": "fini"}, "PRODUIT_INVALIDE"),  # pas un semi-fini
        ({"type_of": "CONDITIONNEMENT"}, "PRODUIT_INVALIDE"),  # vrac : pas un produit fini
    ],
)
async def test_produit_de_la_recette_selon_l_etape(
    client: AsyncClient,
    gestionnaire: Utilisateur,
    atelier: dict[str, Article],
    changement: dict[str, str],
    code: str,
) -> None:
    corps = recette_transformation(atelier)
    for cle, valeur in changement.items():
        corps[cle] = str(atelier[valeur].id) if valeur in atelier else valeur

    reponse = await client.post(
        "/api/v1/production/recettes", json=corps, headers=entetes_pour(gestionnaire)
    )

    assert reponse.status_code == 400 and reponse.json()["code"] == code


async def test_recettes_par_super_admin_et_gestionnaire(
    client: AsyncClient, creer_compte: CreerCompte, atelier: dict[str, Article]
) -> None:
    admin = await creer_compte(RoleUtilisateur.SUPER_ADMIN)
    consultant = await creer_compte(RoleUtilisateur.CONSULTANT)
    corps = recette_transformation(atelier)

    par_admin = await client.post(
        "/api/v1/production/recettes", json=corps, headers=entetes_pour(admin)
    )
    par_consultant = await client.post(
        "/api/v1/production/recettes", json=corps, headers=entetes_pour(consultant)
    )
    lecture = await client.get("/api/v1/production/recettes", headers=entetes_pour(consultant))
    lancement = await client.post(
        "/api/v1/production/ordres",
        json={"recette_id": par_admin.json()["id"], "quantite_prevue": "100"},
        headers=entetes_pour(admin),
    )

    assert (par_admin.status_code, par_consultant.status_code) == (201, 403)
    assert lecture.status_code == 200 and len(lecture.json()) == 1
    assert lancement.status_code == 403  # ordres : Gestionnaire seul


# --- US-PROD-02 à 04 : transformation de bout en bout --------------------------------


async def test_transformation_lancee_declaree_cloturee(
    client: AsyncClient,
    db_session: AsyncSession,
    gestionnaire: Utilisateur,
    atelier: dict[str, Article],
) -> None:
    entetes = entetes_pour(gestionnaire)
    recette = await client.post(
        "/api/v1/production/recettes", json=recette_transformation(atelier), headers=entetes
    )

    # Lancement : 160 kg visés → 400 kg de manioc prévus, il n'en reste que 300
    lancement = await client.post(
        "/api/v1/production/ordres",
        json={"recette_id": recette.json()["id"], "quantite_prevue": "160"},
        headers=entetes,
    )
    assert lancement.status_code == 201
    ordre = lancement.json()
    assert ordre["numero"].startswith("OF-") and ordre["statut"] == "EN_COURS"
    besoin = ordre["consommations"][0]
    assert (besoin["quantite_prevue"], besoin["manque"]) == ("400.0000", "100.0000")

    adresse = f"/api/v1/production/ordres/{ordre['id']}"
    sans_sortie = await client.post(
        f"{adresse}/cloturer",
        json={"consommations": [{"article_id": str(atelier["manioc"].id), "quantite": "250"}]},
        headers=entetes,
    )
    assert sans_sortie.status_code == 409 and sans_sortie.json()["code"] == "AUCUNE_SORTIE"

    # Sorties au fil des jours : deux semi-finis du même lot, une erreur retirée
    await client.post(
        f"{adresse}/sorties",
        json={"article_id": str(atelier["vrac"].id), "quantite": "70"},
        headers=entetes,
    )
    erreur = await client.post(
        f"{adresse}/sorties",
        json={"article_id": str(atelier["vrac"].id), "quantite": "700"},
        headers=entetes,
    )
    await client.post(
        f"{adresse}/sorties/{erreur.json()['sorties'][-1]['id']}/retirer", headers=entetes
    )
    sorties = await client.post(
        f"{adresse}/sorties",
        json={"article_id": str(atelier["gros"].id), "quantite": "30"},
        headers=entetes,
    )
    assert sorties.json()["quantite_produite"] == "100.000"
    produit_fini = await client.post(
        f"{adresse}/sorties",
        json={"article_id": str(atelier["fini"].id), "quantite": "1"},
        headers=entetes,
    )
    assert produit_fini.status_code == 400  # une transformation produit du vrac

    trop = await client.post(
        f"{adresse}/cloturer",
        json={"consommations": [{"article_id": str(atelier["manioc"].id), "quantite": "350"}]},
        headers=entetes,
    )
    assert trop.status_code == 409 and trop.json()["code"] == "COMPOSANT_MANQUANT"
    assert "il reste 300 kg" in trop.json()["message"]

    cloture = await client.post(
        f"{adresse}/cloturer",
        json={
            "consommations": [{"article_id": str(atelier["manioc"].id), "quantite": "250"}],
            "pertes": "12.5",
        },
        headers=entetes,
    )

    assert cloture.status_code == 200
    detail = cloture.json()
    assert detail["statut"] == "TERMINE" and detail["quantite_pertes"] == "12.500"
    # 250 kg × 150 = 37 500 FCFA répartis sur 100 kg produits → 375 FCFA/kg
    assert (detail["cout_total"], detail["rendement"]) == ("37500.00", "0.4000")
    assert {s["cout_unitaire"] for s in detail["sorties"]} == {"375.0000"}
    for code, stock in (("manioc", "50.000"), ("vrac", "70.000"), ("gros", "30.000")):
        await db_session.refresh(atelier[code])
        assert atelier[code].stock_actuel == Decimal(stock)
    await db_session.refresh(atelier["vrac"])
    assert atelier["vrac"].cout_moyen == Decimal("375.0000")
    types = (
        await db_session.execute(
            select(MouvementStock.type_mouvement).where(
                MouvementStock.reference_document == detail["numero"]
            )
        )
    ).scalars()
    assert sorted(types) == [
        TypeMouvementStock.CONSO_PRODUCTION,
        TypeMouvementStock.ENTREE_PRODUCTION,
        TypeMouvementStock.ENTREE_PRODUCTION,
    ]
    encore = await client.post(
        f"{adresse}/sorties",
        json={"article_id": str(atelier["vrac"].id), "quantite": "1"},
        headers=entetes,
    )
    assert encore.status_code == 409 and encore.json()["code"] == "ORDRE_CLOS"


async def test_conditionnement_vrac_et_emballage(
    client: AsyncClient,
    db_session: AsyncSession,
    gestionnaire: Utilisateur,
    atelier: dict[str, Article],
) -> None:
    entetes = entetes_pour(gestionnaire)
    await approvisionner(db_session, atelier["vrac"], "60", "400", gestionnaire)
    recette = await client.post(
        "/api/v1/production/recettes",
        json={
            "type_of": "CONDITIONNEMENT",
            "article_produit_id": str(atelier["fini"].id),
            "nom_recette": "Attiéké 500 g",
            "quantite_base_produite": "1",
            "composants": [
                {"article_id": str(atelier["vrac"].id), "quantite": "0.5"},
                {"article_id": str(atelier["sachet"].id), "quantite": "1"},
            ],
        },
        headers=entetes,
    )
    ordre = (
        await client.post(
            "/api/v1/production/ordres",
            json={"recette_id": recette.json()["id"], "quantite_prevue": "100"},
            headers=entetes,
        )
    ).json()
    assert [c["quantite_prevue"] for c in ordre["consommations"]] == ["50.0000", "100.0000"]
    adresse = f"/api/v1/production/ordres/{ordre['id']}"
    autre = await client.post(
        f"{adresse}/sorties",
        json={"article_id": str(atelier["vrac"].id), "quantite": "1"},
        headers=entetes,
    )
    assert autre.status_code == 400
    await client.post(
        f"{adresse}/sorties",
        json={"article_id": str(atelier["fini"].id), "quantite": "96"},
        headers=entetes,
    )

    cloture = await client.post(
        f"{adresse}/cloturer",
        json={
            "consommations": [
                {"article_id": str(atelier["vrac"].id), "quantite": "48"},
                {"article_id": str(atelier["sachet"].id), "quantite": "98"},
            ]
        },
        headers=entetes,
    )

    # 48 kg × 400 + 98 sachets × 25 = 21 650 FCFA pour 96 sachets → 225,5208 FCFA
    assert cloture.json()["cout_total"] == "21650.00"
    assert cloture.json()["sorties"][0]["cout_unitaire"] == "225.5208"
    assert cloture.json()["rendement"] is None
    await db_session.refresh(atelier["vrac"])
    await db_session.refresh(atelier["fini"])
    # Le vrac non ensaché reste dans le stock du semi-fini
    assert atelier["vrac"].stock_actuel == Decimal("12.000")
    assert atelier["fini"].stock_actuel == Decimal("96.000")


async def test_annulation_d_un_ordre_en_cours(
    client: AsyncClient,
    db_session: AsyncSession,
    gestionnaire: Utilisateur,
    atelier: dict[str, Article],
) -> None:
    entetes = entetes_pour(gestionnaire)
    recette = await client.post(
        "/api/v1/production/recettes", json=recette_transformation(atelier), headers=entetes
    )
    ordre = (
        await client.post(
            "/api/v1/production/ordres",
            json={"recette_id": recette.json()["id"], "quantite_prevue": "100"},
            headers=entetes,
        )
    ).json()
    adresse = f"/api/v1/production/ordres/{ordre['id']}"

    annulation = await client.post(
        f"{adresse}/annuler", json={"motif": "Manioc pas encore livré"}, headers=entetes
    )
    encore = await client.post(f"{adresse}/annuler", json={"motif": "Encore"}, headers=entetes)

    assert annulation.json()["statut"] == "ANNULE"
    assert "Manioc pas encore livré" in annulation.json()["observations"]
    assert encore.status_code == 409
    await db_session.refresh(atelier["manioc"])
    assert atelier["manioc"].stock_actuel == Decimal("300.000")
    en_cours = await client.get(
        "/api/v1/production/ordres", params={"statut": "EN_COURS"}, headers=entetes
    )
    assert en_cours.json()["total"] == 0
