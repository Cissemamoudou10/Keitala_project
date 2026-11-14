"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Filtres, recherche et page gardés dans l'adresse (charte, section 7) : un lien
 * partagé ou un retour arrière retrouve la même liste.
 * Changer un filtre ramène à la première page.
 */
export function useParametresAdresse() {
  const router = useRouter();
  const chemin = usePathname();
  const parametres = useSearchParams();

  const lire = React.useCallback((nom: string) => parametres.get(nom) ?? "", [parametres]);

  const modifier = React.useCallback(
    (valeurs: Record<string, string | number | null>) => {
      const suivants = new URLSearchParams(parametres.toString());
      for (const [nom, valeur] of Object.entries(valeurs)) {
        if (valeur === null || valeur === "" || (nom === "page" && valeur === 1)) {
          suivants.delete(nom);
        } else {
          suivants.set(nom, String(valeur));
        }
      }
      if (!("page" in valeurs)) suivants.delete("page");
      const recherche = suivants.toString();
      router.replace(recherche ? `${chemin}?${recherche}` : chemin, { scroll: false });
    },
    [chemin, parametres, router],
  );

  const page = Math.max(1, Number(parametres.get("page")) || 1);
  return { lire, modifier, page };
}
