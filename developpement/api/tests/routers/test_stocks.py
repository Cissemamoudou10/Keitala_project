"""Sprint 3 : mouvements (règles 1 à 4), pertes, inventaires, journal, alertes."""

from collections.abc import Awaitable, Callable
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.erreurs import ErreurMetier
from app.models import Article, MouvementStock, TransactionTresorerie, Utilisateur
from app.models.enums import RoleUtilisateur, TypeMouvementStock
from app.services.numerotation import prochain_numero
from app.services.stocks import ecrire_mouvement_stock, nouveau_cout_moyen, verrouiller_articles
from tests.conftest import entetes_pour

CreerCompte = Callable[..., Awaitable[Utilisateur]]


@pytest.fixture
async def gestionnaire(creer_compte: CreerCompte) -> Utilisateur:
    return await creer_compte(RoleUtilisateur.GESTIONNAIRE)


async def article(session: AsyncSession, code: str) -> Article:
    return (await session.execute(select(Article).where(Article.code_sku == code))).scalar_one()


async def approvisionner(
    session: AsyncSession, code: str, quantite: str, cout: str, auteur: Utilisateur
) -> Article:
    """Entrée valorisée directe (comme le fera un achat), pour préparer un stock."""
    a = (await verrouiller_articles(session, [(await article(session, code)).id])).popitem()[1]
    await ecrire_mouvement_stock(
        session,
        a,
        type_mouvement=TypeMouvementStock.ENTREE_ACHAT,
        quantite=Decimal(quantite),
        cout_entree=Decimal(cout),
        utilisateur_id=auteur.id,
    )
    await session.flush()
    return a


# --- Écriture unique des mouvements -------------------------------------------------


def test_cout_moyen_pondere() -> None:
    # 100 kg à 250 + 50 kg à 400 → (25 000 + 20 000) / 150 = 300
    assert nouveau_cout_moyen(Decimal(100), Decimal(250), Decimal(50), Decimal(400)) == Decimal(
        "300.0000"
    )
    # Sans stock : le coût d'entrée devient le coût moyen
    assert nouveau_cout_moyen(Decimal(0), Decimal(0), Decimal(10), Decimal("312.5")) == Decimal(
        "312.5000"
    )


async def test_entree_valorisee_puis_sortie_au_cout_moyen(
    db_session: AsyncSession, gestionnaire: Utilisateur
) -> None:
    await approvisionner(db_session, "MP-MAI", "100", "250", gestionnaire)
    mais = await approvisionner(db_session, "MP-MAI", "50", "400", gestionnaire)
    assert (mais.stock_actuel, mais.cout_moyen) == (Decimal("150.000"), Decimal("300.0000"))

    sortie = await ecrire_mouvement_stock(
        db_session,
        mais,
        type_mouvement=TypeMouvementStock.SORTIE_VENTE,
        quantite=Decimal("-30"),
        utilisateur_id=gestionnaire.id,
    )

    assert (sortie.stock_avant, sortie.stock_apres) == (Decimal("150.000"), Decimal("120.000"))
    assert sortie.cout_unitaire == Decimal("300.0000")
    assert mais.cout_moyen == Decimal("300.0000")  # une sortie ne change pas le coût moyen


async def test_stock_insuffisant_refuse_sauf_derogation(
    db_session: AsyncSession, gestionnaire: Utilisateur
) -> None:
    mais = await approvisionner(db_session, "MP-MAI", "10", "250", gestionnaire)

    with pytest.raises(ErreurMetier) as erreur:
        await ecrire_mouvement_stock(
            db_session,
            mais,
            type_mouvement=TypeMouvementStock.SORTIE_VENTE,
            quantite=Decimal("-11"),
            utilisateur_id=gestionnaire.id,
        )
    assert erreur.value.code == "STOCK_INSUFFISANT"
    assert erreur.value.message == (
        "Stock insuffisant : il reste 10 kg de Maïs. Réduisez la quantité."
    )

    mais.autoriser_stock_negatif = True
    sortie = await ecrire_mouvement_stock(
        db_session,
        mais,
        type_mouvement=TypeMouvementStock.SORTIE_VENTE,
        quantite=Decimal("-11"),
        utilisateur_id=gestionnaire.id,
    )
    assert sortie.stock_apres == Decimal("-1.000")


async def test_numerotation_suivie_par_annee(db_session: AsyncSession) -> None:
    premier = await prochain_numero(db_session, "INV")
    second = await prochain_numero(db_session, "INV")

    assert premier.startswith("INV-") and premier.endswith("-0001")
    assert second.endswith("-0002")


# --- Pertes (US-STK-06) -------------------------------------------------------------


async def test_perte_en_unite_de_saisie(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur
) -> None:
    soja = await approvisionner(db_session, "MP-SOJ-CON", "100", "250", gestionnaire)
    sac = (
        await client.get(f"/api/v1/articles/{soja.id}", headers=entetes_pour(gestionnaire))
    ).json()["unites"][0]

    reponse = await client.post(
        "/api/v1/stocks/pertes",
        json={
            "article_id": str(soja.id),
            "quantite": "1",
            "unite_id": sac["id"],
            "motif": "AVARIE",
            "commentaire": "Sac mouillé",
        },
        headers=entetes_pour(gestionnaire),
    )

    assert reponse.status_code == 201
    mouvement = reponse.json()
    assert mouvement["type_mouvement"] == "SORTIE_PERTE"
    assert mouvement["quantite"] == "-50.000"  # 1 sac de 50 kg, en unité de base
    assert mouvement["stock_apres"] == "50.000"
    assert mouvement["motif"] == "Avarie : Sac mouillé"
    assert mouvement["auteur"] == gestionnaire.nom_complet
    # Sans effet sur la trésorerie
    nombre = await db_session.scalar(select(func.count()).select_from(TransactionTresorerie))
    assert nombre == 0


async def test_perte_superieure_au_stock(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur
) -> None:
    mil = await approvisionner(db_session, "MP-MIL", "5", "200", gestionnaire)

    reponse = await client.post(
        "/api/v1/stocks/pertes",
        json={"article_id": str(mil.id), "quantite": "6", "motif": "CASSE"},
        headers=entetes_pour(gestionnaire),
    )

    assert reponse.status_code == 409
    assert reponse.json()["code"] == "STOCK_INSUFFISANT"


@pytest.mark.parametrize("role", [RoleUtilisateur.CONSULTANT, RoleUtilisateur.SUPER_ADMIN])
async def test_perte_reservee_au_gestionnaire(
    client: AsyncClient, db_session: AsyncSession, creer_compte: CreerCompte, role: RoleUtilisateur
) -> None:
    utilisateur = await creer_compte(role)
    mil = await article(db_session, "MP-MIL")

    reponse = await client.post(
        "/api/v1/stocks/pertes",
        json={"article_id": str(mil.id), "quantite": "1", "motif": "CASSE"},
        headers=entetes_pour(utilisateur),
    )

    assert reponse.status_code == 403


# --- Inventaires (US-STK-04) --------------------------------------------------------


async def test_stock_de_depart_par_inventaire(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur
) -> None:
    entetes = entetes_pour(gestionnaire)
    soja = await article(db_session, "MP-SOJ-CON")

    ouverture = await client.post(
        "/api/v1/stocks/inventaires", json={"famille": "MATIERE_PREMIERE"}, headers=entetes
    )
    assert ouverture.status_code == 201
    inventaire = ouverture.json()
    assert inventaire["numero"].endswith("-0001") and inventaire["statut"] == "EN_COURS"
    assert inventaire["nombre_lignes"] == 4
    assert {ligne["stock_theorique"] for ligne in inventaire["lignes"]} == {"0.000"}
    adresse = f"/api/v1/stocks/inventaires/{inventaire['id']}"

    # Un seul inventaire en cours à la fois
    second = await client.post("/api/v1/stocks/inventaires", json={}, headers=entetes)
    assert second.status_code == 409 and second.json()["code"] == "INVENTAIRE_EN_COURS"

    # Écart sans motif : refusé
    sans_motif = await client.put(
        adresse,
        json={"lignes": [{"article_id": str(soja.id), "stock_physique": "1000"}]},
        headers=entetes,
    )
    assert sans_motif.status_code == 400 and sans_motif.json()["code"] == "MOTIF_REQUIS"

    # Avec motif mais sans coût : la validation l'exige (article sans coût moyen)
    comptage = await client.put(
        adresse,
        json={
            "lignes": [
                {
                    "article_id": str(soja.id),
                    "stock_physique": "1000",
                    "motif": "AUTRE",
                    "commentaire": "Stock de départ",
                }
            ]
        },
        headers=entetes,
    )
    ligne = next(
        ligne for ligne in comptage.json()["lignes"] if ligne["article"]["id"] == str(soja.id)
    )
    assert ligne["ecart"] == "1000.000"
    assert comptage.json()["nombre_ecarts"] == 1
    sans_cout = await client.post(f"{adresse}/valider", headers=entetes)
    assert sans_cout.status_code == 400 and sans_cout.json()["code"] == "COUT_REQUIS"

    await client.put(
        adresse,
        json={
            "lignes": [
                {
                    "article_id": str(soja.id),
                    "stock_physique": "1000",
                    "motif": "AUTRE",
                    "cout_unitaire": "250",
                }
            ]
        },
        headers=entetes,
    )
    validation = await client.post(f"{adresse}/valider", headers=entetes)

    assert validation.status_code == 200
    assert validation.json()["statut"] == "VALIDE"
    await db_session.refresh(soja)
    assert (soja.stock_actuel, soja.cout_moyen) == (Decimal("1000.000"), Decimal("250.0000"))
    mouvement = (
        await db_session.execute(select(MouvementStock).where(MouvementStock.article_id == soja.id))
    ).scalar_one()
    assert mouvement.type_mouvement == TypeMouvementStock.AJUSTEMENT_INVENTAIRE
    assert mouvement.reference_document == inventaire["numero"]
    assert mouvement.inventaire_id is not None
    assert mouvement.motif == "Autre"

    # Validé : figé
    apres = await client.put(adresse, json={"lignes": []}, headers=entetes)
    assert apres.status_code == 409 and apres.json()["code"] == "INVENTAIRE_VALIDE"


async def test_ecart_applique_au_stock_du_moment(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur
) -> None:
    entetes = entetes_pour(gestionnaire)
    mais = await approvisionner(db_session, "MP-MAI", "100", "300", gestionnaire)
    ouverture = await client.post(
        "/api/v1/stocks/inventaires", json={"famille": "MATIERE_PREMIERE"}, headers=entetes
    )
    adresse = f"/api/v1/stocks/inventaires/{ouverture.json()['id']}"
    # Comptage : 97 kg (3 kg de dessiccation)
    await client.put(
        adresse,
        json={
            "lignes": [
                {"article_id": str(mais.id), "stock_physique": "97", "motif": "DESSICCATION"}
            ]
        },
        headers=entetes,
    )
    # Pendant le comptage, une vente de 10 kg
    await ecrire_mouvement_stock(
        db_session,
        mais,
        type_mouvement=TypeMouvementStock.SORTIE_VENTE,
        quantite=Decimal("-10"),
        utilisateur_id=gestionnaire.id,
    )
    await db_session.flush()

    await client.post(f"{adresse}/valider", headers=entetes)

    await db_session.refresh(mais)
    assert mais.stock_actuel == Decimal("87.000")  # 100 − 10 (vente) − 3 (écart)
    assert mais.cout_moyen == Decimal("300.0000")  # ajustement au coût moyen


@pytest.mark.parametrize("role", [RoleUtilisateur.CONSULTANT, RoleUtilisateur.SUPER_ADMIN])
async def test_inventaire_saisi_par_le_gestionnaire(
    client: AsyncClient, creer_compte: CreerCompte, role: RoleUtilisateur
) -> None:
    utilisateur = await creer_compte(role)

    ouverture = await client.post(
        "/api/v1/stocks/inventaires", json={}, headers=entetes_pour(utilisateur)
    )
    liste = await client.get("/api/v1/stocks/inventaires", headers=entetes_pour(utilisateur))

    assert ouverture.status_code == 403
    assert liste.status_code == 200


# --- Journal, synthèse et alertes (US-STK-05, US-STK-02, US-STK-03) -----------------


async def test_journal_filtre(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur
) -> None:
    await approvisionner(db_session, "MP-MAI", "100", "300", gestionnaire)
    mil = await approvisionner(db_session, "MP-MIL", "40", "200", gestionnaire)
    entetes = entetes_pour(gestionnaire)

    tout = await client.get("/api/v1/stocks/mouvements", headers=entetes)
    du_mil = await client.get(
        "/api/v1/stocks/mouvements", params={"article_id": str(mil.id)}, headers=entetes
    )
    pertes = await client.get(
        "/api/v1/stocks/mouvements", params={"type_mouvement": "SORTIE_PERTE"}, headers=entetes
    )
    hier = await client.get(
        "/api/v1/stocks/mouvements", params={"au": "2020-01-01"}, headers=entetes
    )

    assert tout.json()["total"] == 2
    premier = tout.json()["items"][0]  # le plus récent d'abord
    assert premier["article"]["designation"] == "Mil"
    assert premier["auteur"] == gestionnaire.nom_complet
    assert (premier["stock_avant"], premier["stock_apres"]) == ("0.000", "40.000")
    assert du_mil.json()["total"] == 1
    assert pertes.json()["total"] == 0
    assert hier.json()["total"] == 0


async def test_valeur_et_alertes(
    client: AsyncClient, db_session: AsyncSession, gestionnaire: Utilisateur
) -> None:
    # Soja : seuil 250 kg ; 1 000 kg à 250 → hors alerte ; Maïs : seuil 250, 100 kg → alerte
    await approvisionner(db_session, "MP-SOJ-CON", "1000", "250", gestionnaire)
    await approvisionner(db_session, "MP-MAI", "100", "300", gestionnaire)
    entetes = entetes_pour(gestionnaire)

    etat = (await client.get("/api/v1/stocks/etat-global", headers=entetes)).json()
    alertes = (await client.get("/api/v1/stocks/alertes-rupture", headers=entetes)).json()
    soja = (
        await client.get("/api/v1/articles", params={"recherche": "MP-SOJ-CON"}, headers=entetes)
    ).json()["items"][0]

    matieres = next(f for f in etat["familles"] if f["famille"] == "MATIERE_PREMIERE")
    assert matieres["valeur"] == "280000.00"  # 1 000 × 250 + 100 × 300
    assert etat["valeur_totale"] == "280000.00"
    codes_en_alerte = {a["code_sku"] for a in alertes["items"]}
    assert "MP-MAI" in codes_en_alerte and "MP-SOJ-CON" not in codes_en_alerte
    assert (soja["valeur_stock"], soja["en_alerte"]) == ("250000.00", False)
