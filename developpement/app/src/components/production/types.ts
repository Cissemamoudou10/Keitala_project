type ArticleResume = {
  id: string;
  code_sku: string;
  designation: string;
  contenance: string | null;
  unite_base: string;
};

export type TypeOf = "TRANSFORMATION" | "CONDITIONNEMENT";
export type StatutOf = "BROUILLON" | "EN_COURS" | "TERMINE" | "ANNULE";

export const LIBELLES_TYPE_OF: Record<TypeOf, string> = {
  TRANSFORMATION: "Transformation",
  CONDITIONNEMENT: "Conditionnement",
};

/** Ce que produit chaque étape (règle 8). */
export const FAMILLE_PRODUIT: Record<TypeOf, "SEMI_FINI" | "PRODUIT_FINI"> = {
  TRANSFORMATION: "SEMI_FINI",
  CONDITIONNEMENT: "PRODUIT_FINI",
};

export type Recette = {
  id: string;
  type_of: TypeOf;
  produit: ArticleResume;
  nom_recette: string;
  quantite_base_produite: string;
  notes_preparation: string | null;
  est_active: boolean;
  composants: { article: ArticleResume; quantite: string }[];
  date_creation: string;
};

export type OrdreResume = {
  id: string;
  numero: string;
  type_of: TypeOf;
  recette_id: string;
  recette: string;
  produit: ArticleResume;
  quantite_prevue: string;
  quantite_produite: string;
  statut: StatutOf;
  date_lancement: string | null;
  date_cloture: string | null;
  responsable: string;
};

export type Consommation = {
  article: ArticleResume;
  quantite_prevue: string;
  quantite_consommee: string;
  cout_unitaire: string;
  stock_actuel: string;
  manque: string;
};

export type Sortie = {
  id: number;
  article: ArticleResume;
  date_production: string;
  quantite: string;
  cout_unitaire: string;
};

export type OrdreDetail = OrdreResume & {
  quantite_pertes: string;
  observations: string | null;
  consommations: Consommation[];
  sorties: Sortie[];
  cout_total: string | null;
  rendement: string | null;
};

export type PageOrdres = {
  items: OrdreResume[];
  total: number;
  page: number;
  taille: number;
  pages_total: number;
};

export const CLE_PRODUCTION = ["production"] as const;

type Variante = "neutre" | "info" | "succes";

export const ETATS_OF: Record<StatutOf, { libelle: string; variante: Variante }> = {
  BROUILLON: { libelle: "Brouillon", variante: "neutre" },
  EN_COURS: { libelle: "En cours", variante: "info" },
  TERMINE: { libelle: "Terminé", variante: "succes" },
  ANNULE: { libelle: "Annulé", variante: "neutre" },
};
