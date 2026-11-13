"use client";

import * as React from "react";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ErreurApi } from "@/lib/api";

/** Session expirée et non renouvelable (le proxy a déjà tenté) : retour à la connexion. */
function renvoyerVersConnexionSi401(erreur: unknown) {
  if (!(erreur instanceof ErreurApi) || erreur.statut !== 401) return;
  if (window.location.pathname.startsWith("/connexion")) return;
  const suite = `${window.location.pathname}${window.location.search}`;
  // Rechargement complet voulu : efface de la mémoire toute donnée de la session
  // précédente (poste partagé), ce que router.push ne garantit pas.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/connexion?suite=${encodeURIComponent(suite)}`);
}

function creerClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: renvoyerVersConnexionSi401 }),
    mutationCache: new MutationCache({ onError: renvoyerVersConnexionSi401 }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Un nouvel essai seulement si le serveur ou le réseau est en cause
        retry: (essais, erreur) =>
          essais < 2 &&
          erreur instanceof ErreurApi &&
          (erreur.statut === 0 || erreur.statut >= 500),
      },
      // Jamais de nouvel essai automatique d'une écriture : risque de doublon (P-009)
      mutations: { retry: false },
    },
  });
}

export function Fournisseurs({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(creerClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
