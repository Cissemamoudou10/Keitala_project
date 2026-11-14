import { Suspense } from "react";

import { ListeInventaires } from "@/components/inventaires/liste-inventaires";

// Inventaires physiques (US-STK-04). Page lue dans l'adresse : rendu navigateur.
export default function PageInventaires() {
  return (
    <Suspense>
      <ListeInventaires />
    </Suspense>
  );
}
