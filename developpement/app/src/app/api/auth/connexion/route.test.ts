// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/auth/connexion/route";

const identifiants = JSON.stringify({ email: "awa@keitala.ml", mot_de_passe: "secret-de-test" });

function demande() {
  return new NextRequest("http://localhost:3000/api/auth/connexion", {
    method: "POST",
    body: identifiants,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/auth/connexion", () => {
  it("pose les jetons en cookies HttpOnly et ne renvoie que le profil", async () => {
    vi.stubEnv("API_URL", "http://api.test");
    const fetchSimule = vi.fn().mockResolvedValue(
      Response.json({
        jeton_acces: "acces-123",
        jeton_rafraichissement: "rafraichissement-456",
        duree_acces: 1800,
        duree_rafraichissement: 604800,
        utilisateur: { nom_complet: "Awa Keita", role: "SUPER_ADMIN" },
      }),
    );
    vi.stubGlobal("fetch", fetchSimule);

    const reponse = await POST(demande());

    expect(fetchSimule).toHaveBeenCalledWith(
      "http://api.test/api/v1/auth/login",
      expect.objectContaining({ method: "POST", body: identifiants }),
    );
    expect(reponse.status).toBe(200);
    const corps = await reponse.text();
    expect(corps).not.toContain("acces-123");
    expect(JSON.parse(corps)).toEqual({
      utilisateur: { nom_complet: "Awa Keita", role: "SUPER_ADMIN" },
    });

    const poses = reponse.headers.getSetCookie();
    const acces = poses.find((cookie) => cookie.startsWith("keitala_acces="));
    expect(acces).toMatch(/HttpOnly/i);
    expect(acces).toMatch(/SameSite=lax/i);
    expect(acces).toMatch(/Max-Age=1800/);
    expect(
      poses.some((cookie) => cookie.startsWith("keitala_rafraichissement=rafraichissement-456")),
    ).toBe(true);
  });

  it("relaie le refus de l'API sans poser de cookie", async () => {
    vi.stubEnv("API_URL", "http://api.test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            code: "IDENTIFIANTS_INVALIDES",
            message: "Email ou mot de passe incorrect.",
            details: null,
          },
          { status: 401 },
        ),
      ),
    );

    const reponse = await POST(demande());

    expect(reponse.status).toBe(401);
    expect((await reponse.json()).code).toBe("IDENTIFIANTS_INVALIDES");
    expect(reponse.headers.getSetCookie()).toEqual([]);
  });
});
