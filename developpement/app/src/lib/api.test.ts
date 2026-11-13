import { afterEach, describe, expect, it, vi } from "vitest";

import { appelerApi, ErreurApi } from "@/lib/api";

function repondre(statut: number, corps: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(corps === null ? null : JSON.stringify(corps), {
      status: statut,
      headers: { "content-type": "application/json" },
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("appelerApi", () => {
  it("passe par le proxy /api avec les paramètres non vides", async () => {
    const fetchSimule = repondre(200, { ok: true });
    vi.stubGlobal("fetch", fetchSimule);

    await appelerApi("ventes", { parametres: { page: 2, taille: 50, client: "", statut: null } });

    expect(fetchSimule).toHaveBeenCalledWith("/api/ventes?page=2&taille=50", expect.anything());
  });

  it("envoie le corps en JSON", async () => {
    const fetchSimule = repondre(201, { id: "1" });
    vi.stubGlobal("fetch", fetchSimule);

    await appelerApi("ventes", { methode: "POST", corps: { montant: "45000" } });

    const [, options] = fetchSimule.mock.calls[0];
    expect(options).toMatchObject({
      method: "POST",
      body: JSON.stringify({ montant: "45000" }),
      headers: { "content-type": "application/json" },
    });
  });

  it("lève une ErreurApi avec le message français de l'API", async () => {
    vi.stubGlobal(
      "fetch",
      repondre(409, {
        code: "STOCK_INSUFFISANT",
        message: "Stock insuffisant : il reste 12 sachets.",
        details: { disponible: "12" },
      }),
    );

    const erreur = await appelerApi("ventes").catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ErreurApi);
    expect(erreur).toMatchObject({
      code: "STOCK_INSUFFISANT",
      statut: 409,
      message: "Stock insuffisant : il reste 12 sachets.",
      details: { disponible: "12" },
    });
  });

  it("donne un message honnête quand une écriture perd la connexion", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const erreur = await appelerApi("ventes", { methode: "POST", corps: {} }).catch(
      (e: unknown) => e,
    );
    expect(erreur).toMatchObject({ code: "CONNEXION_PERDUE", statut: 0 });
    expect((erreur as ErreurApi).message).toContain("Nous ne savons pas");
  });

  it("renvoie undefined pour une réponse 204", async () => {
    vi.stubGlobal("fetch", repondre(204, null));
    await expect(appelerApi("ventes/1/controle", { methode: "POST" })).resolves.toBeUndefined();
  });
});
