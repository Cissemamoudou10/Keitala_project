import { Suspense } from "react";

import { Page } from "@/components/coquille/page";
import { SqueletteTableau } from "@/components/etats/squelettes";
import { FicheOrdre } from "@/components/production/ordre";

// Fiche d'un ordre de fabrication (US-PROD-02 à 04). L'identifiant n'est connu qu'à la
// requête : il est lu sous <Suspense> (Cache Components de Next 16).
export default function PageOrdre({ params }: PageProps<"/production/ordres/[id]">) {
  return (
    <Suspense
      fallback={
        <Page titre="Ordre de fabrication">
          <SqueletteTableau lignes={5} colonnes={4} />
        </Page>
      }
    >
      <Contenu params={params} />
    </Suspense>
  );
}

async function Contenu({ params }: Pick<PageProps<"/production/ordres/[id]">, "params">) {
  const { id } = await params;
  return <FicheOrdre id={id} />;
}
