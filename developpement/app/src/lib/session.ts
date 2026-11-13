"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { appelerApi } from "@/lib/api";
import { peut, type Action, type Role } from "@/lib/droits";

/** Profil renvoyé par l'API (UtilisateurLecture). */
export type Utilisateur = {
  id: string;
  nom_complet: string;
  email: string;
  role: Role;
  est_actif: boolean;
  derniere_connexion: string | null;
  date_creation: string;
};

export const CLE_SESSION = ["session"] as const;

/** Utilisateur connecté. Une session expirée renvoie à la connexion (components/fournisseurs). */
export function useSession() {
  return useQuery({
    queryKey: CLE_SESSION,
    queryFn: ({ signal }) => appelerApi<Utilisateur>("auth/me", { signal }),
    staleTime: 5 * 60_000,
  });
}

/** Le rôle courant peut-il faire cette action ? Faux tant que la session n'est pas chargée. */
export function usePeut(action: Action): boolean {
  const { data } = useSession();
  return peut(data?.role, action);
}

export function useDeconnexion() {
  const client = useQueryClient();
  return async () => {
    await fetch("/api/auth/deconnexion", { method: "POST" }).catch(() => undefined);
    client.clear();
    // Rechargement complet voulu : efface de la mémoire toute donnée de la session
    // précédente (poste partagé), ce que router.push ne garantit pas.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/connexion");
  };
}
