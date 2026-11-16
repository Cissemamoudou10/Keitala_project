import type { PieceLue } from "@/components/pieces/detail-piece";

export type StatutDocument = "BROUILLON" | "VALIDE" | "ANNULE";

/** VenteResume de l'API : une vente (FAC-…) ou un don (DON-…). Montants en chaînes. */
export type VenteResume = {
  id: string;
  numero: string;
  date_vente: string;
  client_id: string | null;
  /** Client du répertoire, nom saisi, ou bénéficiaire d'un don ; null = client comptoir. */
  client: string | null;
  est_don: boolean;
  montant_total: string;
  montant_regle: string;
  reste_a_payer: string;
  comptes: string[];
  statut: StatutDocument;
  date_creation: string;
};

export type VenteDetail = VenteResume &
  PieceLue & {
    client_telephone: string | null;
    client_adresse: string | null;
    motif_don: string | null;
    notes: string | null;
    auteur: string;
    annule_le: string | null;
    annule_par: string | null;
    motif_annulation: string | null;
  };

export type PageVentes = {
  items: VenteResume[];
  total: number;
  page: number;
  taille: number;
  pages_total: number;
};

export type Entreprise = {
  nom: string;
  adresse: string;
  telephone: string;
  identifiants: string;
  mentions: string;
};

export const CLE_VENTES = ["ventes"] as const;

export const CLIENT_COMPTOIR = "Client comptoir";

type Variante = "succes" | "attention" | "danger" | "neutre";

const NUL = /^0+(\.0+)?$/;

/** Étiquette de la charte (section 7) : Payé, Partiel, À crédit, Annulé, Don. */
export function etatVente(
  vente: Pick<VenteResume, "statut" | "est_don" | "montant_regle" | "reste_a_payer">,
): { libelle: string; variante: Variante } {
  if (vente.statut === "ANNULE") return { libelle: "Annulé", variante: "neutre" };
  if (vente.est_don) return { libelle: "Don", variante: "neutre" };
  if (NUL.test(vente.reste_a_payer)) return { libelle: "Payé", variante: "succes" };
  if (NUL.test(vente.montant_regle)) return { libelle: "À crédit", variante: "danger" };
  return { libelle: "Partiel", variante: "attention" };
}
