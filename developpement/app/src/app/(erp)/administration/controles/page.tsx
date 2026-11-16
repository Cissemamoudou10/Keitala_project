import { Suspense } from "react";

import { PiecesAControler } from "@/components/controles/pieces-a-controler";

// Contrôle a posteriori (US-TRES-05), Super Admin. Filtre lu dans l'adresse.
export default function PageControles() {
  return (
    <Suspense>
      <PiecesAControler />
    </Suspense>
  );
}
