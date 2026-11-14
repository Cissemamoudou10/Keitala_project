import { Suspense } from "react";

import { RepertoireTiers } from "@/components/tiers/repertoire-tiers";

// Clients et fournisseurs (US-REF-01). Hors du menu (six entrées au plus, charte §6) :
// on y arrive depuis Ventes et Achats. Filtres lus dans l'adresse : rendu navigateur.
export default function PageTiers() {
  return (
    <Suspense>
      <RepertoireTiers />
    </Suspense>
  );
}
