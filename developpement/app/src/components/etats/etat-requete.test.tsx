import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EtatRequete } from "@/components/etats/etat-requete";
import { ErreurApi } from "@/lib/api";

function Ecran({ charger }: { charger: () => Promise<string[]> }) {
  const requete = useQuery({ queryKey: ["essai"], queryFn: charger, retry: false });
  return (
    <EtatRequete
      requete={requete}
      chargement={<p>Squelette</p>}
      estVide={(lignes) => lignes.length === 0}
      vide={<p>Aucune vente aujourd&apos;hui.</p>}
    >
      {(lignes) => (
        <ul>
          {lignes.map((ligne) => (
            <li key={ligne}>{ligne}</li>
          ))}
        </ul>
      )}
    </EtatRequete>
  );
}

function afficher(charger: () => Promise<string[]>) {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <Ecran charger={charger} />
    </QueryClientProvider>,
  );
}

describe("EtatRequete", () => {
  it("montre le squelette puis les données", async () => {
    afficher(async () => ["FAC-2026-0042"]);
    expect(screen.getByText("Squelette")).toBeInTheDocument();
    expect(await screen.findByText("FAC-2026-0042")).toBeInTheDocument();
  });

  it("montre l'état vide", async () => {
    afficher(async () => []);
    expect(await screen.findByText("Aucune vente aujourd'hui.")).toBeInTheDocument();
  });

  it("montre le message de l'API et relance au clic sur « Réessayer »", async () => {
    const charger = vi
      .fn<() => Promise<string[]>>()
      .mockRejectedValueOnce(new ErreurApi("API_INJOIGNABLE", "Le serveur ne répond pas.", 502))
      .mockResolvedValueOnce(["FAC-2026-0042"]);
    afficher(charger);

    expect(await screen.findByRole("alert")).toHaveTextContent("Le serveur ne répond pas.");
    await userEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("FAC-2026-0042")).toBeInTheDocument();
    expect(charger).toHaveBeenCalledTimes(2);
  });
});
