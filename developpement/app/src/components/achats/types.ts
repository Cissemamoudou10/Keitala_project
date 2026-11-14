import type { Article } from "@/components/articles/types";

type ArticleResume = Pick<Article, "id" | "code_sku" | "designation" | "contenance" | "unite_base">;

export type StatutDocument = "BROUILLON" | "VALIDE" | "ANNULE";

export type LigneAchat = {
  id: number;
  article: ArticleResume;
  unite: string;
  facteur_conversion: string;
  quantite: string;
  prix_unitaire: string;
  quantite_base: string;
  montant_total: string;
};

export type Reglement = {
  id: string;
  compte_id: number;
  compte: string;
  montant: string;
  date_reglement: string;
  reference_paiement: string | null;
  statut: StatutDocument;
  auteur: string;
};

/** AchatResume de l'API. Montants en chaînes décimales (règle 10). */
export type AchatResume = {
  id: string;
  numero: string;
  numero_facture_fournisseur: string | null;
  date_achat: string;
  fournisseur_id: string | null;
  fournisseur: string | null;
  montant_total: string;
  montant_regle: string;
  reste_a_payer: string;
  comptes: string[];
  statut: StatutDocument;
  date_creation: string;
};

export type AchatDetail = AchatResume & {
  notes: string | null;
  auteur: string;
  annule_le: string | null;
  annule_par: string | null;
  motif_annulation: string | null;
  lignes: LigneAchat[];
  reglements: Reglement[];
};

export type PageAchats = {
  items: AchatResume[];
  total: number;
  page: number;
  taille: number;
  pages_total: number;
};

export const CLE_ACHATS = ["achats"] as const;

type Variante = "succes" | "attention" | "danger" | "neutre";

/** Étiquette de la charte (section 7) : Payé, Partiel, À crédit, Annulé. */
export function etatPaiement(
  achat: Pick<AchatResume, "statut" | "montant_regle" | "reste_a_payer">,
): { libelle: string; variante: Variante } {
  if (achat.statut === "ANNULE") return { libelle: "Annulé", variante: "neutre" };
  if (/^0+(\.0+)?$/.test(achat.reste_a_payer)) return { libelle: "Payé", variante: "succes" };
  if (/^0+(\.0+)?$/.test(achat.montant_regle)) return { libelle: "À crédit", variante: "danger" };
  return { libelle: "Partiel", variante: "attention" };
}

export function estNul(valeur: string): boolean {
  return /^-?0*(\.0*)?$/.test(valeur.trim());
}
