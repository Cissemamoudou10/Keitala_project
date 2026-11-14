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

export type TypeMouvement =
  | "ENTREE_ACHAT"
  | "SORTIE_VENTE"
  | "SORTIE_DON"
  | "CONSO_PRODUCTION"
  | "ENTREE_PRODUCTION"
  | "AJUSTEMENT_INVENTAIRE"
  | "SORTIE_PERTE"
  | "ANNULATION";

/** Charte, section 12 : « Sortie de production », pas « Entrée de produit fini ». */
export const LIBELLES_MOUVEMENTS: Record<TypeMouvement, string> = {
  ENTREE_ACHAT: "Entrée achat",
  SORTIE_VENTE: "Sortie vente",
  SORTIE_DON: "Sortie don",
  CONSO_PRODUCTION: "Consommation de production",
  ENTREE_PRODUCTION: "Sortie de production",
  AJUSTEMENT_INVENTAIRE: "Ajustement d'inventaire",
  SORTIE_PERTE: "Perte",
  ANNULATION: "Annulation",
};

export type MotifEcart = "CASSE" | "AVARIE" | "DESSICCATION" | "ERREUR_COMPTAGE" | "AUTRE";

export const LIBELLES_MOTIFS: Record<MotifEcart, string> = {
  CASSE: "Casse",
  AVARIE: "Avarie",
  DESSICCATION: "Dessiccation",
  ERREUR_COMPTAGE: "Erreur de comptage",
  AUTRE: "Autre",
};
