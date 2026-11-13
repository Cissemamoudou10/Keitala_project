"""US-AUTH-01 : connexion, jetons d'accès et de rafraîchissement."""

from collections.abc import Awaitable, Callable

from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import creer_jeton_rafraichissement, hacher_mot_de_passe
from app.models import Utilisateur
from app.models.enums import RoleUtilisateur
from tests.conftest import MOT_DE_PASSE_TEST, entetes_pour

CreerCompte = Callable[..., Awaitable[Utilisateur]]


async def connexion(
    client: AsyncClient, email: str, mot_de_passe: str = MOT_DE_PASSE_TEST
) -> Response:
    return await client.post(
        "/api/v1/auth/login", json={"email": email, "mot_de_passe": mot_de_passe}
    )


async def test_connexion_renvoie_les_jetons_et_le_profil(
    client: AsyncClient, creer_compte: CreerCompte
) -> None:
    gestionnaire = await creer_compte(RoleUtilisateur.GESTIONNAIRE)

    # L'email est reconnu sans tenir compte de la casse ni des espaces
    reponse = await connexion(client, f"  {gestionnaire.email.upper()} ")

    assert reponse.status_code == 200
    corps = reponse.json()
    assert corps["jeton_acces"] and corps["jeton_rafraichissement"]
    assert corps["duree_acces"] > 0 and corps["duree_rafraichissement"] > corps["duree_acces"]
    assert corps["utilisateur"]["role"] == "GESTIONNAIRE"
    assert corps["utilisateur"]["derniere_connexion"] is not None
    assert "mot_de_passe_hash" not in corps["utilisateur"]


async def test_mauvais_mot_de_passe_et_email_inconnu_donnent_le_meme_message(
    client: AsyncClient, creer_compte: CreerCompte
) -> None:
    gestionnaire = await creer_compte(RoleUtilisateur.GESTIONNAIRE)

    mauvais = await connexion(client, gestionnaire.email, "mauvais-mot-de-passe")
    inconnu = await connexion(client, "personne@keitala.ml")

    assert mauvais.status_code == inconnu.status_code == 401
    assert mauvais.json() == inconnu.json()
    assert mauvais.json()["code"] == "IDENTIFIANTS_INVALIDES"


async def test_compte_desactive_refuse(client: AsyncClient, creer_compte: CreerCompte) -> None:
    inactif = await creer_compte(RoleUtilisateur.GESTIONNAIRE, est_actif=False)

    reponse = await connexion(client, inactif.email)

    assert reponse.status_code == 403
    assert reponse.json()["code"] == "COMPTE_DESACTIVE"


async def test_profil_de_l_utilisateur_connecte(
    client: AsyncClient, creer_compte: CreerCompte
) -> None:
    consultant = await creer_compte(RoleUtilisateur.CONSULTANT)

    reponse = await client.get("/api/v1/auth/me", headers=entetes_pour(consultant))

    assert reponse.status_code == 200
    assert reponse.json()["email"] == consultant.email


async def test_profil_sans_jeton_ou_avec_un_jeton_falsifie(client: AsyncClient) -> None:
    sans = await client.get("/api/v1/auth/me")
    faux = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer abc.def.ghi"})

    assert sans.status_code == 401
    assert faux.status_code == 401
    assert faux.json()["code"] == "SESSION_EXPIREE"


async def test_rafraichissement(client: AsyncClient, creer_compte: CreerCompte) -> None:
    gestionnaire = await creer_compte(RoleUtilisateur.GESTIONNAIRE)
    jetons = (await connexion(client, gestionnaire.email)).json()

    reponse = await client.post(
        "/api/v1/auth/refresh", json={"jeton_rafraichissement": jetons["jeton_rafraichissement"]}
    )

    assert reponse.status_code == 200
    nouveau = reponse.json()["jeton_acces"]
    profil = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {nouveau}"})
    assert profil.status_code == 200


async def test_les_types_de_jetons_ne_sont_pas_interchangeables(
    client: AsyncClient, creer_compte: CreerCompte
) -> None:
    gestionnaire = await creer_compte(RoleUtilisateur.GESTIONNAIRE)
    jetons = (await connexion(client, gestionnaire.email)).json()

    acces_comme_rafraichissement = await client.post(
        "/api/v1/auth/refresh", json={"jeton_rafraichissement": jetons["jeton_acces"]}
    )
    rafraichissement_comme_acces = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {jetons['jeton_rafraichissement']}"},
    )

    assert acces_comme_rafraichissement.status_code == 401
    assert rafraichissement_comme_acces.status_code == 401


async def test_desactivation_coupe_la_session_immediatement(
    client: AsyncClient, creer_compte: CreerCompte, db_session: AsyncSession
) -> None:
    gestionnaire = await creer_compte(RoleUtilisateur.GESTIONNAIRE)
    entetes = entetes_pour(gestionnaire)
    rafraichissement = creer_jeton_rafraichissement(gestionnaire.id, gestionnaire.mot_de_passe_hash)

    gestionnaire.est_actif = False
    await db_session.flush()

    assert (await client.get("/api/v1/auth/me", headers=entetes)).status_code == 401
    reponse = await client.post(
        "/api/v1/auth/refresh", json={"jeton_rafraichissement": rafraichissement}
    )
    assert reponse.status_code == 401


async def test_nouveau_mot_de_passe_invalide_les_anciens_jetons(
    client: AsyncClient, creer_compte: CreerCompte, db_session: AsyncSession
) -> None:
    gestionnaire = await creer_compte(RoleUtilisateur.GESTIONNAIRE)
    anciens = entetes_pour(gestionnaire)

    gestionnaire.mot_de_passe_hash = hacher_mot_de_passe("un-tout-nouveau-mot-de-passe")
    await db_session.flush()

    assert (await client.get("/api/v1/auth/me", headers=anciens)).status_code == 401
    assert (
        await client.get("/api/v1/auth/me", headers=entetes_pour(gestionnaire))
    ).status_code == 200
