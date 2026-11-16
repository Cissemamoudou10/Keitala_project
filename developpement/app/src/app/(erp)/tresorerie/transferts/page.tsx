import { Suspense } from "react";

import { Transferts } from "@/components/tresorerie/transferts";

// Trésorerie (Sprint 6). Filtres lus dans l'adresse : rendu sous <Suspense>.
export default function PageTransferts() {
  return (
    <Suspense>
      <Transferts />
    </Suspense>
  );
}
