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

  it("porte l'en-tête secret du reverse proxy seulement s'il est configuré (D-037)", async () => {
    vi.stubEnv("API_URL", "http://api.test");
    const fetchSimule = vi.fn().mockResolvedValue(Response.json({}));
    vi.stubGlobal("fetch", fetchSimule);

    await relayerVersApi(requete("/api/ventes"), ["ventes"]);
    vi.stubEnv("API_CLE_PROXY", "secret-de-test");
    await relayerVersApi(requete("/api/ventes"), ["ventes"]);

    const [sans, avec] = fetchSimule.mock.calls.map(([, options]) => options.headers as Headers);
    expect(sans.get("x-cle-proxy")).toBeNull();
    expect(avec.get("x-cle-proxy")).toBe("secret-de-test");
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

describe("relayerVersApi : session", () => {
  const jetons = (suffixe: string) => ({
    jeton_acces: `acces-${suffixe}`,
    jeton_rafraichissement: `rafraichissement-${suffixe}`,
    duree_acces: 1800,
    duree_rafraichissement: 604800,
    utilisateur: {},
  });
  const cookies = (valeurs: Record<string, string>) =>
    Object.entries(valeurs)
      .map(([nom, valeur]) => `${nom}=${valeur}`)
      .join("; ");

  it.each([
    ["auth", "login"],
    ["auth", "refresh"],
  ])("refuse /api/%s/%s, qui renverrait les jetons au navigateur", async (...chemin) => {
    vi.stubEnv("API_URL", "http://api.test");
    const fetchSimule = vi.fn();
    vi.stubGlobal("fetch", fetchSimule);

    const reponse = await relayerVersApi(
      requete(`/api/${chemin.join("/")}`, { method: "POST" }),
      chemin,
    );

    expect(reponse.status).toBe(404);
    expect(fetchSimule).not.toHaveBeenCalled();
  });

  it("renouvelle la session avant l'appel quand le jeton d'accès a expiré", async () => {
    vi.stubEnv("API_URL", "http://api.test");
    const fetchSimule = vi
      .fn()
      .mockResolvedValueOnce(Response.json(jetons("neuf")))
      .mockResolvedValueOnce(Response.json({ id: "1" }));
    vi.stubGlobal("fetch", fetchSimule);

    const reponse = await relayerVersApi(
      requete("/api/auth/me", {
        headers: { cookie: cookies({ keitala_rafraichissement: "rafraichissement-ancien" }) },
      }),
      ["auth", "me"],
    );

    expect(reponse.status).toBe(200);
    expect(fetchSimule.mock.calls[0][0]).toBe("http://api.test/api/v1/auth/refresh");
    expect((fetchSimule.mock.calls[1][1].headers as Headers).get("authorization")).toBe(
      "Bearer acces-neuf",
    );
    const poses = reponse.headers.getSetCookie().join("\n");
    expect(poses).toContain("keitala_acces=acces-neuf");
    expect(poses).toMatch(/HttpOnly/i);
  });

  it("après un 401, renouvelle puis rejoue la requête avec le même corps", async () => {
    vi.stubEnv("API_URL", "http://api.test");
    const fetchSimule = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json(jetons("neuf")))
      .mockResolvedValueOnce(Response.json({ ok: true }, { status: 201 }));
    vi.stubGlobal("fetch", fetchSimule);

    const reponse = await relayerVersApi(
      requete("/api/ventes", {
        method: "POST",
        body: JSON.stringify({ montant: "45000" }),
        headers: {
          "content-type": "application/json",
          cookie: cookies({ keitala_acces: "acces-vieux", keitala_rafraichissement: "r" }),
        },
      }),
      ["ventes"],
    );

    expect(reponse.status).toBe(201);
    const rejeu = fetchSimule.mock.calls[2][1];
    expect((rejeu.headers as Headers).get("authorization")).toBe("Bearer acces-neuf");
    expect(new TextDecoder().decode(rejeu.body as ArrayBuffer)).toBe(
      JSON.stringify({ montant: "45000" }),
    );
  });

  it("efface les cookies quand le renouvellement est refusé", async () => {
    vi.stubEnv("API_URL", "http://api.test");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 401 }))
        .mockResolvedValueOnce(new Response(null, { status: 401 })),
    );

    const reponse = await relayerVersApi(
      requete("/api/auth/me", {
        headers: { cookie: cookies({ keitala_acces: "a", keitala_rafraichissement: "r" }) },
      }),
      ["auth", "me"],
    );

    expect(reponse.status).toBe(401);
    const poses = reponse.headers.getSetCookie().join("\n");
    expect(poses).toMatch(/keitala_acces=;/);
    expect(poses).toMatch(/keitala_rafraichissement=;/);
  });
});
