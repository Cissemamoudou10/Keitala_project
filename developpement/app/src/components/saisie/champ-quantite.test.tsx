import * as React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import {
  ChampQuantite,
  quantiteEnBase,
  type UniteSaisie,
} from "@/components/saisie/champ-quantite";

const SAC: UniteSaisie = { id: 7, libelle: "Sac 50 kg", facteur_vers_base: "50.0000" };
const visible = (texte: string | null) => (texte ?? "").replaceAll(" ", " ");

function Banc({ disponible }: { disponible?: string }) {
  const [quantite, setQuantite] = React.useState("");
  const [uniteId, setUniteId] = React.useState<number | null>(null);
  return (
    <ChampQuantite
      id="quantite"
      quantite={quantite}
      onQuantiteChange={setQuantite}
      uniteId={uniteId}
      onUniteChange={setUniteId}
      uniteBase="kg"
      unites={[SAC]}
      disponible={disponible}
    />
  );
}

describe("quantiteEnBase", () => {
  it("convertit l'unité de saisie en unité de base, sans flottant", () => {
    expect(quantiteEnBase("3", 7, [SAC])).toBe("150.000");
    expect(quantiteEnBase("2,5", null, [SAC])).toBe("2.500");
    expect(quantiteEnBase("", 7, [SAC])).toBeNull();
  });
});

describe("ChampQuantite", () => {
  it("affiche la conversion quand une unité de saisie est choisie", async () => {
    render(<Banc />);
    await userEvent.type(screen.getByRole("textbox"), "3");
    await userEvent.click(screen.getByRole("button", { name: "Sac 50 kg" }));

    expect(screen.getByRole("button", { name: "Sac 50 kg" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(visible(screen.getByText(/=/).textContent)).toBe("3 Sacs 50 kg = 150 kg");
  });

  it("ne garde que chiffres et une virgule, 3 décimales au plus", async () => {
    render(<Banc />);
    await userEvent.type(screen.getByRole("textbox"), "1a2.34567");
    expect(screen.getByRole("textbox")).toHaveValue("12,345");
  });

  it("signale une quantité supérieure au stock disponible", async () => {
    render(<Banc disponible="150.000" />);
    expect(visible(screen.getByText(/Disponible/).textContent)).toBe("Disponible : 150 kg");

    await userEvent.type(screen.getByRole("textbox"), "4");
    await userEvent.click(screen.getByRole("button", { name: "Sac 50 kg" }));

    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
    expect(visible(screen.getByText(/Il reste/).textContent)).toBe(
      "Il reste 150 kg. Réduisez la quantité.",
    );
  });
});
