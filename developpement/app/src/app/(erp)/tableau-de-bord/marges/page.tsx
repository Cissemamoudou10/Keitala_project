import { Suspense } from "react";

import { Marges } from "@/components/pilotage/marges";

// Marges par article (US-DASH-02). Période lue dans l'adresse : rendu sous <Suspense>.
export default function PageMarges() {
  return (
    <Suspense>
      <Marges />
    </Suspense>
  );
}
