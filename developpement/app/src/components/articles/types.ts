import type { UniteSaisie } from "@/components/saisie/champ-quantite";
import type { Famille } from "@/lib/libelles";

/** Article tel que renvoyé par l'API (ArticleLecture). Montants et quantités en chaînes. */
export type Article = {
  id: string;
  code_sku: string;
  designation: string;
  famille: Famille;
  categorie_code: string | null;
  contenance: string | null;
  unite_base: string;
  stock_actuel: string;
  cout_moyen: string;
  stock_minimum: string;
  prix_vente_standard: string;
  autoriser_stock_negatif: boolean;
  est_actif: boolean;
  date_creation: string;
  unites: UniteSaisie[];
  /** Calculés par l'API : valeur au coût moyen, et stock ≤ seuil. */
  valeur_stock: string;
  en_alerte: boolean;
};

export type PageArticles = {
  items: Article[];
  total: number;
  page: number;
  taille: number;
  pages_total: number;
};

export const CLE_ARTICLES = ["articles"] as const;

/** « Gari » + « 200 g » → « Gari 200 g ». */
export function nomComplet(article: Pick<Article, "designation" | "contenance">): string {
  return article.contenance ? `${article.designation} ${article.contenance}` : article.designation;
}
