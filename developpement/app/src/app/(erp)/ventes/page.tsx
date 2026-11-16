import { Suspense } from "react";

import { HistoriqueVentes } from "@/components/ventes/historique-ventes";

// Ventes, créances clients et dons (US-VTE-03 à 06). Filtres lus dans l'adresse.
export default function PageVentes() {
  return (
    <Suspense>
      <HistoriqueVentes />
    </Suspense>
  );
}
