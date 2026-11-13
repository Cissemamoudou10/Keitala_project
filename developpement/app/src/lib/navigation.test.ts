import { describe, expect, it } from "vitest";

import { entreesPourRole, estActive } from "@/lib/navigation";

describe("navigation", () => {
  it("réserve Administration au Super Admin", () => {
    const libelles = (role: Parameters<typeof entreesPourRole>[0]) =>
      entreesPourRole(role).map((entree) => entree.libelle);

    expect(libelles("SUPER_ADMIN")).toContain("Administration");
    expect(libelles("GESTIONNAIRE")).not.toContain("Administration");
    expect(libelles("CONSULTANT")).not.toContain("Administration");
    expect(libelles(null)).toHaveLength(6);
  });

  it("marque l'entrée active, y compris sur une sous-page", () => {
    expect(estActive("/ventes", "/ventes")).toBe(true);
    expect(estActive("/ventes", "/ventes/FAC-2026-0042")).toBe(true);
    expect(estActive("/ventes", "/ventes-archives")).toBe(false);
  });
});
