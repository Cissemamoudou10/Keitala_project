/**
 * Ce que chaque rôle peut faire (backlog, section 4 : matrice des droits).
 * Confort d'affichage seulement : la sécurité est assurée par l'API (403).
 */

export type Role = "SUPER_ADMIN" | "GESTIONNAIRE" | "CONSULTANT";

export const LIBELLES_ROLES: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  GESTIONNAIRE: "Gestionnaire",
  CONSULTANT: "Consultant",
};

const DROITS = {
  /** Créer, modifier, activer les comptes (US-AUTH-02). */
  gerer_utilisateurs: ["SUPER_ADMIN"],
  /**
   * Toute saisie (ajouter, modifier, annuler, valider). Le Consultant n'a aucune action
   * (US-AUTH-03). Les modules affineront au besoin (ex. ventes : Gestionnaire seul).
   */
  ecrire: ["SUPER_ADMIN", "GESTIONNAIRE"],
  /** Comptes de trésorerie, soldes d'ouverture, dérogation au stock négatif (matrice). */
  parametrer: ["SUPER_ADMIN"],
  /** Inventaires et pertes : saisis par le Gestionnaire, contrôlés après coup (matrice). */
  saisir_stock: ["GESTIONNAIRE"],
  /** Achats : saisis, réglés et annulés par le Gestionnaire (matrice des droits). */
  saisir_achat: ["GESTIONNAIRE"],
  /** Ventes, dons, encaissements et annulations : Gestionnaire seul (matrice). */
  saisir_vente: ["GESTIONNAIRE"],
} as const satisfies Record<string, readonly Role[]>;

export type Action = keyof typeof DROITS;

export function peut(role: Role | null | undefined, action: Action): boolean {
  return role != null && (DROITS[action] as readonly Role[]).includes(role);
}

/**
 * Adresse de retour après connexion, limitée à une page de l'application : refuse
 * « //site.com » ou « https://… », qui enverraient l'utilisateur ailleurs.
 */
export function suiteSure(suite: string | null | undefined): string {
  if (!suite || !suite.startsWith("/") || suite.startsWith("//") || suite.startsWith("/\\")) {
    return "/tableau-de-bord";
  }
  return suite;
}
