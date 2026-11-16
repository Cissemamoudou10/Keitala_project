"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { EtatRequete } from "@/components/etats/etat-requete";
import { SqueletteChiffresCles } from "@/components/etats/squelettes";
import { CLE_TRESORERIE, type Synthese } from "@/components/tresorerie/types";
import { appelerApi } from "@/lib/api";
import { formaterMontant } from "@/lib/formats";

/** Solde global, créances clients et dettes fournisseurs (US-TRES-01). */
export function SyntheseTresorerie() {
  const requete = useQuery({
    queryKey: [...CLE_TRESORERIE, "synthese"],
    queryFn: ({ signal }) => appelerApi<Synthese>("tresorerie/synthese", { signal }),
  });

  return (
    <EtatRequete requete={requete} chargement={<SqueletteChiffresCles nombre={3} />}>
      {(synthese) => (
        <dl className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1 rounded-md bg-fond-doux p-4">
            <dt className="text-texte-2">Solde global</dt>
            <dd className="text-chiffre-cle font-semibold tabular-nums">
              {formaterMontant(synthese.solde_global)}
            </dd>
          </div>
          <Link
            href="/ventes?vue=a_encaisser"
            className="flex flex-col gap-1 rounded-md border border-bordure p-4 transition-colors hover:bg-fond-survol"
          >
            <dt className="text-texte-2">Créances clients</dt>
            <dd className="text-chiffre-cle font-semibold tabular-nums">
              {formaterMontant(synthese.total_creances)}
            </dd>
          </Link>
          <Link
            href="/achats?vue=a_payer"
            className="flex flex-col gap-1 rounded-md border border-bordure p-4 transition-colors hover:bg-fond-survol"
          >
            <dt className="text-texte-2">Dettes fournisseurs</dt>
            <dd className="text-chiffre-cle font-semibold tabular-nums">
              {formaterMontant(synthese.total_dettes)}
            </dd>
          </Link>
        </dl>
      )}
    </EtatRequete>
  );
}
