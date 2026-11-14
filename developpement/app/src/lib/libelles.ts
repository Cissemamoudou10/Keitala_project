/**
 * Libellés affichés des valeurs de l'API, selon le vocabulaire de la charte (section 12) :
 * « Produits en vrac » et non « Semi-finis ».
 */

export type Famille =
  "SEMENCE" | "INTRANT" | "MATIERE_PREMIERE" | "SEMI_FINI" | "EMBALLAGE" | "PRODUIT_FINI";

export const FAMILLES: Famille[] = [
  "PRODUIT_FINI",
  "MATIERE_PREMIERE",
  "SEMI_FINI",
  "EMBALLAGE",
  "SEMENCE",
  "INTRANT",
];

export const LIBELLES_FAMILLES: Record<Famille, string> = {
  PRODUIT_FINI: "Produits finis",
  MATIERE_PREMIERE: "Matières premières",
  SEMI_FINI: "Produits en vrac",
  EMBALLAGE: "Emballages",
  SEMENCE: "Semences",
  INTRANT: "Intrants",
};

export type TypeCompte = "CAISSE" | "BANQUE" | "MOBILE_MONEY";

export const LIBELLES_TYPES_COMPTE: Record<TypeCompte, string> = {
  CAISSE: "Caisse",
  BANQUE: "Banque",
  MOBILE_MONEY: "Mobile Money",
};

/** Unités de base proposées à la saisie ; une autre reste possible. */
export const UNITES_DE_BASE = ["kg", "L", "sachet", "bouteille", "pot", "unité"];
