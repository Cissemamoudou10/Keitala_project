from httpx import AsyncClient


async def test_sante_base_connectee(client: AsyncClient) -> None:
    reponse = await client.get("/api/v1/sante")
    assert reponse.status_code == 200
    assert reponse.json() == {"statut": "ok", "base_de_donnees": "connecte"}
