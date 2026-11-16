import { Suspense } from "react";

import { Depenses } from "@/components/tresorerie/depenses";

// Trésorerie (Sprint 6). Filtres lus dans l'adresse : rendu sous <Suspense>.
export default function PageDepenses() {
  return (
    <Suspense>
      <Depenses />
    </Suspense>
  );
}
