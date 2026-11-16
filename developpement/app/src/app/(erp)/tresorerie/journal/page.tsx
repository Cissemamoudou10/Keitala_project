import { Suspense } from "react";

import { JournalTresorerie } from "@/components/tresorerie/journal-tresorerie";

// Trésorerie (Sprint 6). Filtres lus dans l'adresse : rendu sous <Suspense>.
export default function PageJournalTresorerie() {
  return (
    <Suspense>
      <JournalTresorerie />
    </Suspense>
  );
}
