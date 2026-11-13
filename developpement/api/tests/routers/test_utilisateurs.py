"""US-AUTH-02 : gestion des comptes par le Super Admin."""

from collections.abc import Awaitable, Callable

import pytest
from httpx import AsyncClient

from app.models import Utilisateur
from app.models.enums import RoleUtilisateur
from tests.conftest import entetes_pour

CreerCompte = Callable[..., Awaitable[Utilisateur]]

NOUVEAU_COMPTE = {
    "nom_complet": "Fatoumata Diarra",
    "email": "Fatoumata.Diarra@Keitala.ml",
    "role": "GESTIONNAIRE",
    "mot_de_passe": "premier-mot-de-passe",
}


@pytest.fixture
async def admin(creer_compte: CreerCompte) -> Utilisateur:
    return await creer_compte(RoleUtilisateur.SUPER_ADMIN)


async def test_creation_puis_liste(client: AsyncClient, admin: Utilisateur) -> None:
    creation = await client.post(
        "/api/v1/utilisateurs", json=NOUVEAU_COMPTE, headers=entetes_pour(admin)
    )
    assert creation.status_code == 201
    assert creation.json()["email"] == "fatoumata.diarra@keitala.ml"  # normalisé
    assert "mot_de_passe" not in creation.json()

    # Le nouveau compte peut se connecter
    connexion = await client.post(
        "/api/v1/auth/login",
        json={"email": "fatoumata.diarra@keitala.ml", "mot_de_passe": "premier-mot-de-passe"},
    )
    assert connexion.status_code == 200

    liste = await client.get("/api/v1/utilisateurs", headers=entetes_pour(admin))
    assert liste.status_code == 200
    corps = liste.json()
    assert corps["total"] == 2
    assert {u["email"] for u in corps["items"]} == {admin.email, "fatoumata.diarra@keitala.ml"}


async def test_email_deja_utilise(client: AsyncClient, admin: Utilisateur) -> None:
    doublon = {**NOUVEAU_COMPTE, "email": admin.email.upper()}

    reponse = await client.post("/api/v1/utilisateurs", json=doublon, headers=entetes_pour(admin))

    assert reponse.status_code == 409
    assert reponse.json()["code"] == "EMAIL_DEJA_UTILISE"


@pytest.mark.parametrize(
    ("champ", "valeur"),
    [("role", "COMPTABLE"), ("mot_de_passe", "court"), ("email", "pas-un-email")],
)
async def test_valeurs_refusees(
    client: AsyncClient, admin: Utilisateur, champ: str, valeur: str
) -> None:
    reponse = await client.post(
        "/api/v1/utilisateurs",
        json={**NOUVEAU_COMPTE, champ: valeur},
        headers=entetes_pour(admin),
    )

    assert reponse.status_code == 422
    assert champ in reponse.json()["details"]


async def test_modification_desactivation_et_reinitialisation(
    client: AsyncClient, admin: Utilisateur, creer_compte: CreerCompte
) -> None:
    gestionnaire = await creer_compte(RoleUtilisateur.GESTIONNAIRE)
    adresse = f"/api/v1/utilisateurs/{gestionnaire.id}"

    reponse = await client.put(
        adresse,
        json={"role": "CONSULTANT", "est_actif": False, "mot_de_passe": "nouveau-mot-de-passe"},
        headers=entetes_pour(admin),
    )

    assert reponse.status_code == 200
    assert reponse.json()["role"] == "CONSULTANT"
    assert reponse.json()["est_actif"] is False
    connexion = await client.post(
        "/api/v1/auth/login",
        json={"email": gestionnaire.email, "mot_de_passe": "nouveau-mot-de-passe"},
    )
    assert connexion.json()["code"] == "COMPTE_DESACTIVE"  # mot de passe accepté, compte inactif


async def test_un_super_admin_ne_peut_pas_se_retirer_ses_droits(
    client: AsyncClient, admin: Utilisateur, creer_compte: CreerCompte
) -> None:
    await creer_compte(RoleUtilisateur.SUPER_ADMIN)  # un autre admin existe

    reponse = await client.put(
        f"/api/v1/utilisateurs/{admin.id}",
        json={"est_actif": False},
        headers=entetes_pour(admin),
    )

    assert reponse.status_code == 400
    assert reponse.json()["code"] == "MODIFICATION_DE_SOI_INTERDITE"


async def test_un_super_admin_peut_retrograder_un_autre(
    client: AsyncClient, admin: Utilisateur, creer_compte: CreerCompte
) -> None:
    autre_admin = await creer_compte(RoleUtilisateur.SUPER_ADMIN)

    reponse = await client.put(
        f"/api/v1/utilisateurs/{autre_admin.id}",
        json={"role": "GESTIONNAIRE"},
        headers=entetes_pour(admin),
    )

    assert reponse.status_code == 200
    assert reponse.json()["role"] == "GESTIONNAIRE"


async def test_compte_introuvable(client: AsyncClient, admin: Utilisateur) -> None:
    reponse = await client.put(
        "/api/v1/utilisateurs/00000000-0000-0000-0000-000000000000",
        json={"nom_complet": "Personne"},
        headers=entetes_pour(admin),
    )

    assert reponse.status_code == 404
    assert reponse.json()["code"] == "UTILISATEUR_INTROUVABLE"


@pytest.mark.parametrize("role", [RoleUtilisateur.GESTIONNAIRE, RoleUtilisateur.CONSULTANT])
async def test_reserve_au_super_admin(
    client: AsyncClient, creer_compte: CreerCompte, role: RoleUtilisateur
) -> None:
    utilisateur = await creer_compte(role)
    entetes = entetes_pour(utilisateur)

    lecture = await client.get("/api/v1/utilisateurs", headers=entetes)
    creation = await client.post("/api/v1/utilisateurs", json=NOUVEAU_COMPTE, headers=entetes)

    assert lecture.status_code == 403
    assert creation.status_code == 403
    assert creation.json()["code"] == "ACCES_REFUSE"


async def test_sans_session(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/utilisateurs")).status_code == 401


async def test_email_invalide_explique_en_francais(client: AsyncClient, admin: Utilisateur) -> None:
    reponse = await client.post(
        "/api/v1/utilisateurs",
        json={**NOUVEAU_COMPTE, "email": "nom@domaine.test"},  # domaine réservé
        headers=entetes_pour(admin),
    )

    assert reponse.status_code == 422
    assert reponse.json()["details"]["email"] == ["Valeur invalide : vérifiez la saisie."]
