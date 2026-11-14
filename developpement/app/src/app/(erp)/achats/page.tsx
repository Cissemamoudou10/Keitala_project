import { Suspense } from "react";

import { HistoriqueAchats } from "@/components/achats/historique-achats";

// Historique et dettes fournisseurs (US-ACH-02, 03). Filtres lus dans l'adresse.
export default function PageAchats() {
  return (
    <Suspense>
      <HistoriqueAchats />
    </Suspense>
  );
}
