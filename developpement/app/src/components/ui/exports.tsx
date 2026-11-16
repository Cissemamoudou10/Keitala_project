"use client";

import { FileSpreadsheet, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Exports d'un grand tableau (US-DASH-03) : fichier Excel produit par l'API, et
 * impression (« Enregistrer en PDF » dans la fenêtre du navigateur, D-036). Le menu et
 * ces boutons ne s'impriment pas.
 */
export function Exports({
  fichier,
  parametres = {},
}: {
  /** Ex. « stocks » pour /api/exports/stocks.xlsx. */
  fichier: string;
  parametres?: Record<string, string | null | undefined>;
}) {
  const recherche = new URLSearchParams(
    Object.entries(parametres).filter((e): e is [string, string] => Boolean(e[1])),
  ).toString();
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button asChild variant="discret">
        <a href={`/api/exports/${fichier}.xlsx${recherche ? `?${recherche}` : ""}`} download>
          <FileSpreadsheet />
          Exporter Excel
        </a>
      </Button>
      <Button variant="discret" onClick={() => window.print()}>
        <Printer />
        Imprimer ou PDF
      </Button>
    </div>
  );
}
