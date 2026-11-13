import { describe, expect, it } from "vitest";

import {
  formaterConversion,
  formaterDate,
  formaterDateHeure,
  formaterDateRelative,
  formaterMontant,
  formaterPourcentage,
  formaterQuantite,
  formaterTelephone,
} from "@/lib/formats";

// Les espaces insécables sont rendus visibles par « · » pour lire les attentes
const visible = (texte: string) => texte.replaceAll(" ", "·");

describe("formaterMontant", () => {
  it.each([
    ["2030000", "2·030·000·FCFA"],
    ["20030000", "20·030·000·FCFA"],
    ["45000.00", "45·000·FCFA"],
    ["45000.50", "45·001·FCFA"],
    ["999.5", "1·000·FCFA"],
    ["-12500", "-12·500·FCFA"],
    ["-0.4", "0·FCFA"],
    [0, "0·FCFA"],
  ])("%s → %s", (valeur, attendu) => {
    expect(visible(formaterMontant(valeur))).toBe(attendu);
  });

  it("renvoie une chaîne vide pour une valeur illisible", () => {
    expect(formaterMontant("abc")).toBe("");
  });
});

describe("formaterQuantite", () => {
  it.each([
    ["48.260", "kg", "48,26·kg"],
    ["96.000", "sachet", "96·sachets"],
    ["1", "sachet", "1·sachet"],
    ["1.5", "sachet", "1,5·sachet"],
    ["1250.0005", "kg", "1·250,001·kg"],
    ["2", "bouteille", "2·bouteilles"],
  ])("%s %s → %s", (valeur, unite, attendu) => {
    expect(visible(formaterQuantite(valeur, unite))).toBe(attendu);
  });

  it("affiche la conversion vers l'unité de base", () => {
    expect(visible(formaterConversion("3", "Sac 50 kg", "150.000", "kg"))).toBe(
      "3·Sacs 50 kg = 150·kg",
    );
  });
});

describe("formaterPourcentage", () => {
  it("garde une décimale au plus", () => {
    expect(visible(formaterPourcentage("74.52"))).toBe("74,5·%");
    expect(visible(formaterPourcentage("74.96"))).toBe("75·%");
  });
});

describe("dates", () => {
  it("affiche une date de l'API sans la décaler de fuseau", () => {
    expect(formaterDate("2026-11-13")).toBe("13/11/2026");
    expect(formaterDate("2026-11-13T23:30:00Z")).toBe("13/11/2026");
  });

  it("dit « Aujourd'hui » ou « Hier » dans les listes", () => {
    const maintenant = new Date("2026-11-13T15:00:00Z");
    expect(formaterDateRelative("2026-11-13T14:32:00Z", maintenant)).toBe("Aujourd'hui, 14:32");
    expect(formaterDateRelative("2026-11-12T08:00:00Z", maintenant)).toBe("Hier");
    expect(formaterDateRelative("2026-11-10T08:00:00Z", maintenant)).toBe("10/11/2026");
  });

  it("donne la date et l'heure exactes", () => {
    expect(formaterDateHeure("2026-11-13T14:32:00Z")).toBe("13/11/2026 à 14:32");
  });
});

describe("formaterTelephone", () => {
  it.each([
    ["76123456", "+223 76 12 34 56"],
    ["+223 76 12 34 56", "+223 76 12 34 56"],
    ["0022376123456", "+223 76 12 34 56"],
    ["12345", "12345"],
  ])("%s → %s", (valeur, attendu) => {
    expect(formaterTelephone(valeur)).toBe(attendu);
  });
});
