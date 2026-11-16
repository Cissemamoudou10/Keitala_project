import { Suspense } from "react";

import { SqueletteFormulaire } from "@/components/etats/squelettes";
import { Facture } from "@/components/ventes/facture";

// Facture A4 imprimable (US-VTE-03). L'identifiant n'est connu qu'à la requête : il est
// lu sous <Suspense> (Cache Components de Next 16).
export default function PageFacture({ params }: PageProps<"/ventes/[id]/facture">) {
  return (
    <Suspense fallback={<SqueletteFormulaire champs={8} />}>
      <Contenu params={params} />
    </Suspense>
  );
}

async function Contenu({ params }: Pick<PageProps<"/ventes/[id]/facture">, "params">) {
  const { id } = await params;
  return <Facture id={id} />;
}
