// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { COOKIE_ACCES, relayerVersApi } from "@/lib/serveur/proxy-api";

function requete(adresse: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(new URL(adresse, "http://localhost:3000"), init);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("relayerVersApi", () => {
  it("relaie vers /api/v1 avec les paramètres et sans cookie du navigateur", async () => {
    vi.stubEnv("API_URL", "http://api.test/");
    const fetchSimule = vi.fn().mockResolvedValue(Response.json({ statut: "ok" }));
    vi.stubGlobal("fetch", fetchSimule);

    const reponse = await relayerVersApi(
      requete("/api/ventes?page=2", { headers: { cookie: `${COOKIE_ACCES}=jeton123; autre=x` } }),
      ["ventes"],
    );

    expect(reponse.status).toBe(200);
    const [cible, options] = fetchSimule.mock.calls[0];
    expect(cible).toBe("http://api.test/api/v1/ventes?page=2");
    const entetes = options.headers as Headers;
    expect(entetes.get("authorization")).toBe("Bearer jeton123");
    expect(entetes.get("cookie")).toBeNull();
  });

  it("refuse de sortir de /api/v1", async () => {
    vi.stubEnv("API_URL", "http://api.test");
    const fetchSimule = vi.fn();
    vi.stubGlobal("fetch", fetchSimule);

    const reponse = await relayerVersApi(requete("/api/x"), ["..", "docs"]);

    expect(reponse.status).toBe(400);
    expect(fetchSimule).not.toHaveBeenCalled();
  });

  it("répond 502 avec un message clair si l'API est injoignable", async () => {
    vi.stubEnv("API_URL", "http://api.test");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const reponse = await relayerVersApi(requete("/api/sante"), ["sante"]);

    expect(reponse.status).toBe(502);
    expect(await reponse.json()).toMatchObject({ code: "API_INJOIGNABLE" });
  });

  it("dit qu'on ne sait pas si une écriture a abouti quand le délai est dépassé", async () => {
    vi.stubEnv("API_URL", "http://api.test");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("délai", "TimeoutError")));

    const reponse = await relayerVersApi(requete("/api/ventes", { method: "POST", body: "{}" }), [
      "ventes",
    ]);

    expect(reponse.status).toBe(504);
    expect((await reponse.json()).message).toContain("Nous ne savons pas");
  });

  it("exige API_URL en production", async () => {
    vi.stubEnv("API_URL", "");
    vi.stubEnv("NODE_ENV", "production");

    const reponse = await relayerVersApi(requete("/api/sante"), ["sante"]);

    expect(reponse.status).toBe(500);
    expect(await reponse.json()).toMatchObject({ code: "CONFIGURATION" });
  });
});
