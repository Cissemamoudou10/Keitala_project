import { Suspense } from "react";

import { Page } from "@/components/coquille/page";
import { SqueletteTableau } from "@/components/etats/squelettes";
import { SaisieInventaire } from "@/components/inventaires/saisie-inventaire";

// Comptage et validation d'un inventaire (US-STK-04). L'identifiant n'est connu qu'à la
// requête : il est lu sous <Suspense> (Cache Components de Next 16).
export default function PageInventaire({ params }: PageProps<"/stocks/inventaires/[id]">) {
  return (
    <Suspense
      fallback={
        <Page titre="Inventaire">
          <SqueletteTableau lignes={8} colonnes={5} />
        </Page>
      }
    >
      <Contenu params={params} />
    </Suspense>
  );
}

async function Contenu({ params }: Pick<PageProps<"/stocks/inventaires/[id]">, "params">) {
  const { id } = await params;
  return <SaisieInventaire id={id} />;
}
