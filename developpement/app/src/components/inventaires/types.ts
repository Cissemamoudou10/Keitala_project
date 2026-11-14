import type { Article } from "@/components/articles/types";
import type { UniteSaisie } from "@/components/saisie/champ-quantite";
import type { Famille, MotifEcart } from "@/lib/libelles";

export type LigneInventaire = {
  id: number;
  article: Pick<Article, "id" | "code_sku" | "designation" | "contenance" | "unite_base">;
  cout_moyen: string;
  unites: UniteSaisie[];
  stock_theorique: string;
  stock_physique: string;
  ecart: string;
  motif: MotifEcart | null;
  commentaire: string | null;
  cout_unitaire: string | null;
};

export type InventaireResume = {
  id: string;
  numero: string;
  date_inventaire: string;
  famille: Famille | null;
  statut: "EN_COURS" | "VALIDE" | "ANNULE";
  observations: string | null;
  auteur: string;
  date_creation: string;
  valide_le: string | null;
  controle_le: string | null;
  nombre_lignes: number;
  nombre_ecarts: number;
};

export type InventaireDetail = InventaireResume & { lignes: LigneInventaire[] };

export type PageInventaires = {
  items: InventaireResume[];
  total: number;
  page: number;
  taille: number;
  pages_total: number;
};

export const CLE_INVENTAIRES = ["stocks", "inventaires"] as const;
