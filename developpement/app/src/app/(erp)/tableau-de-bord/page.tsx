import { Suspense } from "react";

import { TableauDeBord } from "@/components/tableau-de-bord/tableau-de-bord";

// Tableau de bord (US-DASH-01). La sous-navigation lit l'adresse : rendu sous <Suspense>.
export default function PageTableauDeBord() {
  return (
    <Suspense>
      <TableauDeBord />
    </Suspense>
  );
}
