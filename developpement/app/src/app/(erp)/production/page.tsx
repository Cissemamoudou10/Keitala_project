import { Suspense } from "react";

import { Ordres } from "@/components/production/ordres";

// Ordres de fabrication (US-PROD-02). Filtres lus dans l'adresse : rendu sous <Suspense>.
export default function PageProduction() {
  return (
    <Suspense>
      <Ordres />
    </Suspense>
  );
}
