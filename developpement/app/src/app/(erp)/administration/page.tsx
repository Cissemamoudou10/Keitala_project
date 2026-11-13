import { Suspense } from "react";

import { GestionUtilisateurs } from "@/components/utilisateurs/gestion-utilisateurs";

// Administration : gestion des comptes (US-AUTH-02). La page lit ?page= : rendu côté navigateur.
export default function PageAdministration() {
  return (
    <Suspense>
      <GestionUtilisateurs />
    </Suspense>
  );
}
