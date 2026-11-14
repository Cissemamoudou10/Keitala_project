"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { CLE_ARTICLES } from "@/components/articles/types";
import { Page } from "@/components/coquille/page";
import { EtatRequete } from "@/components/etats/etat-requete";
import { SqueletteChiffresCles } from "@/components/etats/squelettes";
import { Badge } from "@/components/ui/badge";
import { appelerApi } from "@/lib/api";
import { formaterMontant } from "@/lib/formats";

type EtatGlobal = { valeur_totale: string; nombre_sous_seuil: number };

/**
 * Tableau de bord, premiers chiffres clés (US-STK-03 : badge d'alerte). Les ventes,
 * soldes, créances et ordres de fabrication s'ajouteront au Sprint 8 (US-DASH-01).
 */
export function TableauDeBord() {
  const etat = useQuery({
    queryKey: [...CLE_ARTICLES, "etat-global"],
    queryFn: ({ signal }) => appelerApi<EtatGlobal>("stocks/etat-global", { signal }),
  });

  return (
    <Page titre="Tableau de bord" description="L'essentiel du jour, en un coup d'œil.">
      <EtatRequete requete={etat} chargement={<SqueletteChiffresCles nombre={2} />}>
        {(donnees) => (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <article className="flex flex-col gap-2 rounded-md border border-bordure p-4">
              <h2 className="text-texte-2">Valeur du stock</h2>
              <p className="text-chiffre-cle font-semibold tabular-nums">
                {formaterMontant(donnees.valeur_totale)}
              </p>
            </article>
            <Link
              href="/stocks?sous_seuil=1"
              className="flex flex-col gap-2 rounded-md border border-bordure p-4 transition-colors hover:bg-fond-survol"
            >
              <h2 className="text-texte-2">Articles sous le seuil</h2>
              <p className="flex items-center gap-2">
                <span className="text-chiffre-cle font-semibold tabular-nums">
                  {donnees.nombre_sous_seuil}
                </span>
                {donnees.nombre_sous_seuil > 0 && (
                  <Badge variant="danger">À réapprovisionner</Badge>
                )}
              </p>
            </Link>
          </div>
        )}
      </EtatRequete>
    </Page>
  );
}
