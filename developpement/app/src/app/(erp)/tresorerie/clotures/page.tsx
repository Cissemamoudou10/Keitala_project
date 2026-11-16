import { Suspense } from "react";

import { Clotures } from "@/components/tresorerie/clotures";

// Trésorerie (Sprint 6). Filtres lus dans l'adresse : rendu sous <Suspense>.
export default function PageClotures() {
  return (
    <Suspense>
      <Clotures />
    </Suspense>
  );
}
