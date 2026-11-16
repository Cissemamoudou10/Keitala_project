"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Page } from "@/components/coquille/page";
import { EtatRequete } from "@/components/etats/etat-requete";
import { EtatVide } from "@/components/etats/etat-vide";
import { SqueletteChiffresCles } from "@/components/etats/squelettes";
import {
  CLE_COMPTES,
  FormulaireModificationCompte,
  FormulaireNouveauCompte,
  FormulaireSoldeOuverture,
  type CompteTresorerie,
} from "@/components/tresorerie/formulaires-compte";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panneau } from "@/components/ui/panneau";
import { SousNavigationTresorerie } from "@/components/tresorerie/sous-navigation-tresorerie";
import { SyntheseTresorerie } from "@/components/tresorerie/synthese-tresorerie";
import { appelerApi } from "@/lib/api";
import { formaterMontant } from "@/lib/formats";
import { LIBELLES_TYPES_COMPTE } from "@/lib/libelles";
import { usePeut } from "@/lib/session";

type Edition =
  | { mode: "creation" }
  | { mode: "modification"; compte: CompteTresorerie }
  | { mode: "ouverture"; compte: CompteTresorerie };

const TITRES: Record<Edition["mode"], string> = {
  creation: "Nouveau compte",
  modification: "Modifier le compte",
  ouverture: "Solde d'ouverture",
};

/** Trésorerie : une carte par compte avec son solde (charte, section 11 ; US-REF-03). */
export function ComptesTresorerie() {
  const parametrer = usePeut("parametrer");
  const [edition, setEdition] = React.useState<Edition | null>(null);
  const requete = useQuery({
    queryKey: CLE_COMPTES,
    queryFn: ({ signal }) => appelerApi<CompteTresorerie[]>("tresorerie/comptes", { signal }),
  });

  return (
    <Page
      titre="Trésorerie"
      description="Solde de chaque compte : caisse, banque et Mobile Money."
      action={
        parametrer && (
          <Button variant="principal" onClick={() => setEdition({ mode: "creation" })}>
            <Plus />
            Nouveau compte
          </Button>
        )
      }
    >
      <SousNavigationTresorerie />
      <SyntheseTresorerie />
      <EtatRequete
        requete={requete}
        chargement={<SqueletteChiffresCles nombre={5} />}
        estVide={(comptes) => comptes.length === 0}
        vide={<EtatVide message="Aucun compte de trésorerie." />}
      >
        {(comptes) => (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {comptes.map((compte) => (
              <li key={compte.id}>
                <CarteCompte
                  compte={compte}
                  parametrer={parametrer}
                  onEdition={(mode) =>
                    setEdition({ mode, compte } as Exclude<Edition, { mode: "creation" }>)
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </EtatRequete>

      <Panneau
        ouvert={edition !== null}
        onOuvertChange={(ouvert) => !ouvert && setEdition(null)}
        titre={edition ? TITRES[edition.mode] : ""}
        description={edition && edition.mode !== "creation" ? edition.compte.nom : undefined}
      >
        {edition?.mode === "creation" && (
          <FormulaireNouveauCompte onTermine={() => setEdition(null)} />
        )}
        {edition?.mode === "modification" && (
          <FormulaireModificationCompte
            key={edition.compte.id}
            compte={edition.compte}
            onTermine={() => setEdition(null)}
          />
        )}
        {edition?.mode === "ouverture" && (
          <FormulaireSoldeOuverture
            key={edition.compte.id}
            compte={edition.compte}
            onTermine={() => setEdition(null)}
          />
        )}
      </Panneau>
    </Page>
  );
}

function CarteCompte({
  compte,
  parametrer,
  onEdition,
}: {
  compte: CompteTresorerie;
  parametrer: boolean;
  onEdition: (mode: "modification" | "ouverture") => void;
}) {
  const ouvertureAttendue = parametrer && compte.est_actif && !compte.solde_ouverture_saisi;
  return (
    <article className="flex h-full flex-col gap-3 rounded-md border border-bordure p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <h2 className="truncate font-semibold">{compte.nom}</h2>
          <span className="text-xs text-texte-2">
            {compte.operateur ?? LIBELLES_TYPES_COMPTE[compte.type]}
          </span>
        </div>
        {!compte.est_actif && <Badge variant="neutre">Inactif</Badge>}
      </div>
      <p className="text-chiffre-cle font-semibold tabular-nums">
        {formaterMontant(compte.solde_actuel)}
      </p>
      {ouvertureAttendue && <Badge variant="attention">Solde d&apos;ouverture à saisir</Badge>}
      <div className="mt-auto flex flex-wrap gap-1 border-t border-bordure pt-2">
        <Button asChild variant="discret">
          <Link href={`/tresorerie/journal?compte=${compte.id}`}>Voir le journal</Link>
        </Button>
        {ouvertureAttendue && (
          <Button variant="discret" onClick={() => onEdition("ouverture")}>
            Saisir le solde d&apos;ouverture
          </Button>
        )}
        {parametrer && (
          <Button variant="discret" onClick={() => onEdition("modification")}>
            Modifier
          </Button>
        )}
      </div>
    </article>
  );
}
