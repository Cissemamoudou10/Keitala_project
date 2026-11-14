"""US-STK-01 (catalogue) et US-REF-02 (unités de saisie) ; règles 1, 2 et 9."""

from collections.abc import Awaitable, Callable
from decimal import Decimal
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Achat, Article, LigneAchat, MouvementStock, Utilisateur
from app.models.enums import RoleUtilisateur, TypeMouvementStock
from tests.conftest import entetes_pour

CreerCompte = Callable[..., Awaitable[Utilisateur]]

NOUVEL_ARTICLE: dict[str, Any] = {
    "code_sku": " kn-ara-pat250 ",
    "designation": "Pâte d'arachide",
    "famille": "PRODUIT_FINI",
    "categorie_code": "ara",
    "contenance": "250 g",
    "unite_base": "pot",
    "stock_minimum": "20",
    "prix_vente_standard": "1500",
}


@pytest.fixture
async def gestionnaire(creer_compte: CreerCompte) -> Utilisateur:
    return await creer_compte(RoleUtilisateur.GESTIONNAIRE)


async def article_par_code(session: AsyncSession, code: str) -> Article:
    return (await session.execute(select(Article).where(Article.code_sku == code))).scalar_one()


async def test_catalogue_de_depart_et_filtres(
    client: AsyncClient, creer_compte: CreerCompte
) -> None:
    consultant = await creer_compte(RoleUtilisateur.CONSULTANT)
    entetes = entetes_pour(consultant)

    tout = await client.get("/api/v1/articles", headers=entetes)
    matieres = await client.get(
        "/api/v1/articles", params={"famille": "MATIERE_PREMIERE"}, headers=entetes
    )
    recherche = await client.get("/api/v1/articles", params={"recherche": "ATTIE"}, headers=entetes)
    familles = await client.get("/api/v1/articles/familles", headers=entetes)

    assert tout.json()["total"] == 29
    assert matieres.json()["total"] == 4
    soja = next(a for a in matieres.json()["items"] if a["code_sku"] == "MP-SOJ-CON")
    assert soja["unite_base"] == "kg"
    assert soja["unites"] == [
        {"id": soja["unites"][0]["id"], "libelle": "Sac 50 kg", "facteur_vers_base": "50.0000"}
    ]
    assert {a["designation"] for a in recherche.json()["items"]} == {
        "Attiéké frais",
        "Attiéké sec",
    }
    assert familles.json()["PRODUIT_FINI"] == 24
    assert familles.json()["EMBALLAGE"] == 0


async def test_creation_normalise_et_n_accepte_pas_le_stock(
    client: AsyncClient, gestionnaire: Utilisateur
) -> None:
    reponse = await client.post(
        "/api/v1/articles",
        json={**NOUVEL_ARTICLE, "stock_actuel": "999", "cout_moyen": "10"},
        headers=entetes_pour(gestionnaire),
    )

    assert reponse.status_code == 201
    article = reponse.json()
    assert article["code_sku"] == "KN-ARA-PAT250"
    assert article["categorie_code"] == "ARA"
    # Stock et coût moyen ne se saisissent pas : ils viennent des mouvements
    assert article["stock_actuel"] == "0.000"
    assert article["cout_moyen"] == "0.0000"
    assert article["prix_vente_standard"] == "1500.00"


async def test_code_article_unique(client: AsyncClient, gestionnaire: Utilisateur) -> None:
    reponse = await client.post(
        "/api/v1/articles",
        json={**NOUVEL_ARTICLE, "code_sku": "mp-soj-con"},
        headers=entetes_pour(gestionnaire),
    )

    assert reponse.status_code == 409
    assert reponse.json()["code"] == "CODE_DEJA_UTILISE"
    assert reponse.json()["details"]["champ"] == "code_sku"


@pytest.mark.parametrize(
    ("champ", "valeur"),
    [
        ("code_sku", "KN SOJ"),
        ("famille", "OUTILLAGE"),
        ("stock_minimum", "-1"),
        ("prix_vente_standard", "1500.50"),
        ("unite_base", ""),
    ],
)
async def test_valeurs_refusees(
    client: AsyncClient, gestionnaire: Utilisateur, champ: str, valeur: str
) -> None:
    reponse = await client.post(
        "/api/v1/articles",
        json={**NOUVEL_ARTICLE, champ: valeur},
        headers=entetes_pour(gestionnaire),
    )

    assert reponse.status_code == 422
    assert champ in reponse.json()["details"]


async def test_derogation_stock_negatif_reservee_au_super_admin(
    client: AsyncClient, gestionnaire: Utilisateur, creer_compte: CreerCompte
) -> None:
    admin = await creer_compte(RoleUtilisateur.SUPER_ADMIN)
    creation = await client.post(
        "/api/v1/articles", json=NOUVEL_ARTICLE, headers=entetes_pour(gestionnaire)
    )
    adresse = f"/api/v1/articles/{creation.json()['id']}"

    refus = await client.put(
        adresse, json={"autoriser_stock_negatif": True}, headers=entetes_pour(gestionnaire)
    )
    accord = await client.put(
        adresse, json={"autoriser_stock_negatif": True}, headers=entetes_pour(admin)
    )

    assert refus.status_code == 403
    assert refus.json()["code"] == "DEROGATION_RESERVEE"
    assert accord.status_code == 200
    assert accord.json()["autoriser_stock_negatif"] is True


async def test_modification_partielle(client: AsyncClient, gestionnaire: Utilisateur) -> None:
    creation = await client.post(
        "/api/v1/articles", json=NOUVEL_ARTICLE, headers=entetes_pour(gestionnaire)
    )

    reponse = await client.put(
        f"/api/v1/articles/{creation.json()['id']}",
        json={"prix_vente_standard": "1750", "contenance": "", "famille": None},
        headers=entetes_pour(gestionnaire),
    )

    assert reponse.status_code == 200
    article = reponse.json()
    assert article["prix_vente_standard"] == "1750.00"
    assert article["contenance"] is None  # vidée
    assert article["famille"] == "PRODUIT_FINI"  # null = inchangé
    assert article["designation"] == "Pâte d'arachide"


async def test_unite_de_base_figee_apres_un_mouvement(
    client: AsyncClient, gestionnaire: Utilisateur, db_session: AsyncSession
) -> None:
    article = await article_par_code(db_session, "MP-MAI")
    db_session.add(
        MouvementStock(
            article_id=article.id,
            type_mouvement=TypeMouvementStock.AJUSTEMENT_INVENTAIRE,
            quantite=Decimal("100"),
            stock_avant=Decimal("0"),
            stock_apres=Decimal("100"),
            utilisateur_id=gestionnaire.id,
        )
    )
    await db_session.flush()

    reponse = await client.put(
        f"/api/v1/articles/{article.id}",
        json={"unite_base": "sac"},
        headers=entetes_pour(gestionnaire),
    )

    assert reponse.status_code == 409
    assert reponse.json()["code"] == "ARTICLE_DEJA_MOUVEMENTE"


async def test_consultant_ne_cree_pas_d_article(
    client: AsyncClient, creer_compte: CreerCompte
) -> None:
    consultant = await creer_compte(RoleUtilisateur.CONSULTANT)

    reponse = await client.post(
        "/api/v1/articles", json=NOUVEL_ARTICLE, headers=entetes_pour(consultant)
    )

    assert reponse.status_code == 403


# --- US-REF-02 : unités de saisie ---------------------------------------------------


async def test_ajout_modification_et_retrait_d_unites(
    client: AsyncClient, gestionnaire: Utilisateur, db_session: AsyncSession
) -> None:
    article = await article_par_code(db_session, "MP-MIL")
    adresse = f"/api/v1/articles/{article.id}/unites"
    entetes = entetes_pour(gestionnaire)
    sac = (await client.get(f"/api/v1/articles/{article.id}", headers=entetes)).json()["unites"][0]

    ajout = await client.put(
        adresse,
        json={
            "unites": [
                {"id": sac["id"], "libelle": "Sac 50 kg", "facteur_vers_base": "50"},
                {"libelle": "Tine", "facteur_vers_base": "17.5"},
            ]
        },
        headers=entetes,
    )
    assert ajout.status_code == 200
    assert [(u["libelle"], u["facteur_vers_base"]) for u in ajout.json()["unites"]] == [
        ("Sac 50 kg", "50.0000"),
        ("Tine", "17.5000"),
    ]

    # Retrait du sac (jamais utilisé) : seule la tine reste
    retrait = await client.put(
        adresse,
        json={
            "unites": [
                {
                    "libelle": "Tine",
                    "facteur_vers_base": "17.5",
                    "id": ajout.json()["unites"][1]["id"],
                }
            ]
        },
        headers=entetes,
    )
    assert retrait.status_code == 200
    assert [u["libelle"] for u in retrait.json()["unites"]] == ["Tine"]


async def test_unite_utilisee_dans_un_achat_non_retirable(
    client: AsyncClient, gestionnaire: Utilisateur, db_session: AsyncSession
) -> None:
    article = await article_par_code(db_session, "MP-SOJ-CON")
    unites = (
        await client.get(f"/api/v1/articles/{article.id}", headers=entetes_pour(gestionnaire))
    ).json()["unites"]
    achat = Achat(numero="ACH-2026-0001", cree_par=gestionnaire.id)
    db_session.add(achat)
    await db_session.flush()
    db_session.add(
        LigneAchat(
            achat_id=achat.id,
            article_id=article.id,
            unite_id=unites[0]["id"],
            facteur_conversion=Decimal("50"),
            quantite=Decimal("3"),
            prix_unitaire=Decimal("12500"),
        )
    )
    await db_session.flush()

    reponse = await client.put(
        f"/api/v1/articles/{article.id}/unites",
        json={"unites": []},
        headers=entetes_pour(gestionnaire),
    )

    assert reponse.status_code == 409
    assert reponse.json()["code"] == "UNITE_UTILISEE"


@pytest.mark.parametrize(
    ("unites", "statut", "code"),
    [
        ([{"libelle": "kg", "facteur_vers_base": "1"}], 400, "UNITE_DE_BASE"),
        ([{"libelle": "Sac", "facteur_vers_base": "0"}], 422, "DONNEES_INVALIDES"),
        (
            [
                {"libelle": "Sac", "facteur_vers_base": "50"},
                {"libelle": "sac ", "facteur_vers_base": "25"},
            ],
            422,
            "DONNEES_INVALIDES",
        ),
        ([{"id": 999999, "libelle": "Sac", "facteur_vers_base": "50"}], 404, "UNITE_INTROUVABLE"),
    ],
)
async def test_unites_refusees(
    client: AsyncClient,
    gestionnaire: Utilisateur,
    db_session: AsyncSession,
    unites: list[dict[str, str]],
    statut: int,
    code: str,
) -> None:
    article = await article_par_code(db_session, "MP-MAN")

    reponse = await client.put(
        f"/api/v1/articles/{article.id}/unites",
        json={"unites": unites},
        headers=entetes_pour(gestionnaire),
    )

    assert reponse.status_code == statut
    assert reponse.json()["code"] == code
