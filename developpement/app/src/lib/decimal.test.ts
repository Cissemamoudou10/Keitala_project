import { describe, expect, it } from "vitest";

import { enSaisie, estInferieur, multiplierDecimaux } from "@/lib/decimal";

describe("multiplierDecimaux", () => {
  it.each([
    ["3", "50.0000", "150.000"],
    ["2,5", "50", "125.000"],
    ["0.1", "0.2", "0.020"], // 0.30000000000000004 en flottant
    ["1.333", "3", "3.999"],
    ["1.0005", "1", "1.001"], // arrondi demi vers le haut
    ["-2", "17.5", "-35.000"],
  ])("%s × %s = %s", (a, b, attendu) => {
    expect(multiplierDecimaux(a, b)).toBe(attendu);
  });

  it("refuse une valeur illisible", () => {
    expect(multiplierDecimaux("abc", "2")).toBeNull();
    expect(multiplierDecimaux("", "2")).toBeNull();
  });
});

describe("estInferieur", () => {
  it("compare sans flottant", () => {
    expect(estInferieur("149.999", "150")).toBe(true);
    expect(estInferieur("150.000", "150")).toBe(false);
    expect(estInferieur("x", "1")).toBeNull();
  });
});

describe("enSaisie", () => {
  it.each([
    ["250.000", "250"],
    ["12.500", "12,5"],
    ["50.0000", "50"],
    ["0.000", "0"],
    ["17.5", "17,5"],
    ["1500", "1500"],
  ])("%s → %s", (valeur, attendu) => {
    expect(enSaisie(valeur)).toBe(attendu);
  });
});
