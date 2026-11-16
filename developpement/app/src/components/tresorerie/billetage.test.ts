import { describe, expect, it } from "vitest";

import { totalBilletage } from "@/components/tresorerie/billetage";

describe("totalBilletage", () => {
  it("additionne billets et pièces, le billet et la pièce de 500 comptés à part", () => {
    expect(totalBilletage({ b10000: "3", b500: "1", p500: "2", p25: "4" })).toBe("31600");
  });

  it("vaut 0 sans rien de compté", () => {
    expect(totalBilletage({})).toBe("0");
  });
});
