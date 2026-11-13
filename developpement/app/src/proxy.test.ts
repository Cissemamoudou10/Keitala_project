// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "@/proxy";

const demande = (chemin: string, cookie?: string) =>
  new NextRequest(new URL(chemin, "http://localhost:3000"), {
    headers: cookie ? { cookie } : undefined,
  });

describe("proxy (vérification rapide de session)", () => {
  it("envoie vers la connexion en gardant la page demandée", () => {
    const reponse = proxy(demande("/ventes?page=2"));

    expect(reponse.status).toBe(307);
    const cible = new URL(reponse.headers.get("location") ?? "");
    expect(cible.pathname).toBe("/connexion");
    expect(cible.searchParams.get("suite")).toBe("/ventes?page=2");
  });

  it("laisse passer avec un cookie de session, même seulement de rafraîchissement", () => {
    expect(proxy(demande("/ventes", "keitala_acces=a")).headers.get("location")).toBeNull();
    expect(
      proxy(demande("/ventes", "keitala_rafraichissement=r")).headers.get("location"),
    ).toBeNull();
  });
});
