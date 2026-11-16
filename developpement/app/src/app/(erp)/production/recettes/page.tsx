import { Suspense } from "react";

import { Recettes } from "@/components/production/recettes";

// Recettes de transformation et de conditionnement (US-PROD-01).
export default function PageRecettes() {
  return (
    <Suspense>
      <Recettes />
    </Suspense>
  );
}
