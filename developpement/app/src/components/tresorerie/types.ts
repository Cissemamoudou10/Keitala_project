import type { TypeFlux } from "@/lib/libelles";

type Page<T> = { items: T[]; total: number; page: number; taille: number; pages_total: number };

export type Synthese = { solde_global: string; total_creances: string; total_dettes: string };

export type Ecriture = {
  id: number;
  date_transaction: string;
  compte_id: number;
  compte: string;
  type_flux: TypeFlux;
  sens: "CREDIT" | "DEBIT";
  montant: string;
  solde_avant: string;
  solde_apres: string;
  libelle: string;
  /** Numéro de la pièce d'origine (FAC-…, ACH-…, DEP-…, TRF-…). */
  piece: string | null;
  auteur: string;
};

export type Categorie = { id: number; nom: string; description: string | null };

type Controle = { controle_le: string | null; controle_par: string | null };

export type Depense = Controle & {
  id: string;
  numero: string;
  date_depense: string;
  categorie_id: number;
  categorie: string;
  compte_id: number;
  compte: string;
  designation: string;
  montant: string;
  reference_paiement: string | null;
  piece_justificative: string | null;
  statut: "BROUILLON" | "VALIDE" | "ANNULE";
  auteur: string;
  date_creation: string;
  annule_le: string | null;
  annule_par: string | null;
  motif_annulation: string | null;
};

export type Transfert = Controle & {
  id: string;
  numero: string;
  date_transfert: string;
  compte_source_id: number;
  compte_source: string;
  compte_destination_id: number;
  compte_destination: string;
  montant: string;
  libelle: string | null;
  reference_paiement: string | null;
  auteur: string;
  date_creation: string;
};

export type PreparationCloture = {
  compte_id: number;
  compte: string;
  date_cloture: string;
  solde_ouverture: string;
  total_entrees: string;
  total_sorties: string;
  solde_theorique: string;
  deja_cloturee: boolean;
};

export type Cloture = Controle & {
  id: string;
  compte_id: number;
  compte: string;
  date_cloture: string;
  solde_ouverture: string;
  total_entrees: string;
  total_sorties: string;
  solde_theorique: string;
  solde_physique: string;
  ecart: string;
  commentaire: string | null;
  auteur: string;
  date_creation: string;
};

export type PageEcritures = Page<Ecriture>;
export type PageDepenses = Page<Depense>;
export type PageTransferts = Page<Transfert>;
export type PageClotures = Page<Cloture>;

/** Toutes les données de trésorerie se relisent ensemble après une écriture. */
export const CLE_TRESORERIE = ["tresorerie"] as const;
