import { Suspense } from "react";

import { ComptesTresorerie } from "@/components/tresorerie/comptes-tresorerie";

// Trésorerie : comptes, soldes et synthèse (US-REF-03, US-TRES-01). La sous-navigation
// lit l'adresse : rendu sous <Suspense>.
export default function PageTresorerie() {
  return (
    <Suspense>
      <ComptesTresorerie />
    </Suspense>
  );
}
