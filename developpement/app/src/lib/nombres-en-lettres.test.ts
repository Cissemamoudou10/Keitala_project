import { describe, expect, it } from "vitest";

import { entierEnLettres, montantEnLettres } from "@/lib/nombres-en-lettres";

describe("entierEnLettres", () => {
  it.each([
    [0n, "zéro"],
    [1n, "un"],
    [16n, "seize"],
    [17n, "dix-sept"],
    [21n, "vingt et un"],
    [22n, "vingt-deux"],
    [71n, "soixante et onze"],
    [77n, "soixante-dix-sept"],
    [80n, "quatre-vingts"],
    [81n, "quatre-vingt-un"],
    [91n, "quatre-vingt-onze"],
    [100n, "cent"],
    [101n, "cent un"],
    [200n, "deux cents"],
    [201n, "deux cent un"],
    [1000n, "mille"],
    [1001n, "mille un"],
    [2000n, "deux mille"],
    [80000n, "quatre-vingt mille"],
    [200000n, "deux cent mille"],
    [1000000n, "un million"],
    [2030000n, "deux millions trente mille"],
    [200000000n, "deux cents millions"],
    [80000000n, "quatre-vingts millions"],
    [1500000000n, "un milliard cinq cents millions"],
  ])("%s → %s", (entier, attendu) => {
    expect(entierEnLettres(entier)).toBe(attendu);
  });
});

describe("montantEnLettres", () => {
  it("écrit l'exemple de la charte", () => {
    expect(montantEnLettres("2030000")).toBe("Deux millions trente mille francs CFA");
  });

  it("accorde « franc » et ajoute « de » après un million rond", () => {
    expect(montantEnLettres("1")).toBe("Un franc CFA");
    expect(montantEnLettres("2000000")).toBe("Deux millions de francs CFA");
    expect(montantEnLettres("45000.00")).toBe("Quarante-cinq mille francs CFA");
  });

  it("arrondit au franc comme l'affichage des montants", () => {
    expect(montantEnLettres("999.50")).toBe("Mille francs CFA");
  });

  it("renvoie une chaîne vide pour une valeur illisible", () => {
    expect(montantEnLettres("abc")).toBe("");
  });
});
