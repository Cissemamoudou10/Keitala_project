"use client";

import type { UseQueryResult } from "@tanstack/react-query";

import { EtatErreur } from "@/components/etats/etat-erreur";

type EtatRequeteProps<T> = {
  requete: UseQueryResult<T>;
  /** Squelette de la forme du contenu (components/etats/squelettes). */
  chargement: React.ReactNode;
  /** Dit si les données reçues sont vides (ex. `(page) => page.items.length === 0`). */
  estVide?: (donnees: T) => boolean;
  /** Affiché quand `estVide` est vrai, en général un <EtatVide>. */
  vide?: React.ReactNode;
  children: (donnees: T) => React.ReactNode;
};

/**
 * Les quatre états d'un écran de données (charte, section 7) à partir d'une requête
 * TanStack Query : chargement, erreur, vide, données. Si un rechargement échoue alors
 * que des données sont déjà affichées, on les garde plutôt que de les effacer.
 */
export function EtatRequete<T>({ requete, chargement, estVide, vide, children }: EtatRequeteProps<T>) {
  if (requete.isPending) return <>{chargement}</>;

  if (requete.isError && requete.data === undefined) {
    return (
      <EtatErreur
        erreur={requete.error}
        onReessayer={() => void requete.refetch()}
        enCours={requete.isFetching}
      />
    );
  }

  const donnees = requete.data as T;
  if (estVide?.(donnees) && vide) return <>{vide}</>;
  return <>{children(donnees)}</>;
}
