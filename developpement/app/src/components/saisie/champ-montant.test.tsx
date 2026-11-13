import * as React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ChampMontant } from "@/components/saisie/champ-montant";

/** Champ contrôlé, comme dans un vrai formulaire ; expose la dernière valeur reçue. */
function Banc({
  initial = "",
  surChangement,
}: {
  initial?: string;
  surChangement?: (v: string) => void;
}) {
  const [valeur, setValeur] = React.useState(initial);
  return (
    <ChampMontant
      aria-label="Montant"
      value={valeur}
      onChange={(v) => {
        setValeur(v);
        surChangement?.(v);
      }}
    />
  );
}

const champ = () => screen.getByLabelText("Montant") as HTMLInputElement;
const visible = (texte: string) => texte.replaceAll(" ", " ");

describe("ChampMontant", () => {
  it("groupe les milliers pendant la frappe et transmet les chiffres seuls", async () => {
    const valeurs: string[] = [];
    render(<Banc surChangement={(v) => valeurs.push(v)} />);
    await userEvent.type(champ(), "2030000");
    expect(visible(champ().value)).toBe("2 030 000");
    expect(valeurs.at(-1)).toBe("2030000");
  });

  it("ignore les lettres et les zéros de tête", async () => {
    render(<Banc />);
    await userEvent.type(champ(), "0a12b5");
    expect(champ().value).toBe("125");
  });

  it("limite à 13 chiffres (capacité de la base)", async () => {
    render(<Banc />);
    await userEvent.type(champ(), "12345678901234567");
    expect(champ().value.replace(/\D/g, "")).toBe("1234567890123");
  });

  it("efface le chiffre voisin quand on efface l'espace d'un groupe", async () => {
    render(<Banc initial="1500" />);
    const element = champ();
    element.focus();
    element.setSelectionRange(2, 2); // juste après « 1 »
    await userEvent.keyboard("{Backspace}");
    expect(element.value).toBe("500");
  });

  it("annonce un clavier numérique et affiche FCFA", () => {
    render(<Banc initial="45000" />);
    expect(champ()).toHaveAttribute("inputmode", "numeric");
    expect(screen.getByText("FCFA")).toBeInTheDocument();
  });
});
