"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ErreurApi } from "@/lib/api";

function creerClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Un nouvel essai seulement si le serveur ou le réseau est en cause
        retry: (essais, erreur) =>
          essais < 2 && erreur instanceof ErreurApi && (erreur.statut === 0 || erreur.statut >= 500),
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
