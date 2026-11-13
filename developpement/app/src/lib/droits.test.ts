import { describe, expect, it } from "vitest";

import { peut, suiteSure } from "@/lib/droits";

describe("peut", () => {
  it("réserve la gestion des comptes au Super Admin", () => {
    expect(peut("SUPER_ADMIN", "gerer_utilisateurs")).toBe(true);
    expect(peut("GESTIONNAIRE", "gerer_utilisateurs")).toBe(false);
    expect(peut("CONSULTANT", "gerer_utilisateurs")).toBe(false);
  });

  it("ne donne aucune action d'écriture au Consultant (US-AUTH-03)", () => {
    expect(peut("GESTIONNAIRE", "ecrire")).toBe(true);
    expect(peut("SUPER_ADMIN", "ecrire")).toBe(true);
    expect(peut("CONSULTANT", "ecrire")).toBe(false);
  });

  it("refuse tout tant que la session n'est pas connue", () => {
    expect(peut(null, "ecrire")).toBe(false);
    expect(peut(undefined, "gerer_utilisateurs")).toBe(false);
  });
});

describe("suiteSure", () => {
  it.each([
    ["/ventes?page=2", "/ventes?page=2"],
    [null, "/tableau-de-bord"],
    ["", "/tableau-de-bord"],
    ["https://pirate.example", "/tableau-de-bord"],
    ["//pirate.example", "/tableau-de-bord"],
    ["/\\pirate.example", "/tableau-de-bord"],
  ])("%s → %s", (suite, attendu) => {
    expect(suiteSure(suite)).toBe(attendu);
  });
});
