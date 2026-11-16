import { describe, expect, it } from "vitest";

import {
  additionnerDecimaux,
  diviserDecimaux,
  enSaisie,
  estInferieur,
  multiplierDecimaux,
  soustraireDecimaux,
} from "@/lib/decimal";

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

describe("soustraireDecimaux", () => {
  it.each([
    ["97", "100.000", "-3"],
    ["1000", "0.000", "1000"],
    ["12,5", "12.500", "0"],
    ["0.3", "0.1", "0.2"], // 0.19999999999999998 en flottant
    ["x", "1", null],
  ])("%s − %s = %s", (a, b, attendu) => {
    expect(soustraireDecimaux(a, b)).toBe(attendu);
  });
});

describe("additionnerDecimaux", () => {
  it("additionne sans flottant", () => {
    expect(additionnerDecimaux(["0.1", "0.2"])).toBe("0.3");
    expect(additionnerDecimaux(["37500", "12500.00", "-50000"])).toBe("0");
    expect(additionnerDecimaux([])).toBe("0");
  });

  it("refuse une valeur illisible", () => {
    expect(additionnerDecimaux(["12", "abc"])).toBeNull();
  });
});

describe("diviserDecimaux", () => {
  it("divise sans flottant, arrondi au plus proche", () => {
    expect(diviserDecimaux("250", "100", 3)).toBe("2.500");
    expect(diviserDecimaux("0.5000", "1.000", 3)).toBe("0.500");
    expect(diviserDecimaux("2", "3", 3)).toBe("0.667");
    expect(diviserDecimaux("21650", "96", 4)).toBe("225.5208");
  });

  it("refuse une division par zéro", () => {
    expect(diviserDecimaux("1", "0")).toBeNull();
  });
});
