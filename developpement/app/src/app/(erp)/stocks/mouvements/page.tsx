import { Suspense } from "react";

import { JournalMouvements } from "@/components/articles/journal-mouvements";

// Journal des mouvements de stock (US-STK-05). Filtres lus dans l'adresse : rendu navigateur.
export default function PageMouvements() {
  return (
    <Suspense>
      <JournalMouvements />
    </Suspense>
  );
}
