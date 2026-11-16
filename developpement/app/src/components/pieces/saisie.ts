"use client";

import * as React from "react";

import type { Article, PageArticles } from "@/components/articles/types";
import type { CompteTresorerie } from "@/components/tresorerie/formulaires-compte";
import { appelerApi, ErreurApi } from "@/lib/api";
import { additionnerDecimaux, multiplierDecimaux, soustraireDecimaux } from "@/lib/decimal";

/**
 * Saisie commune aux pièces (achat, vente) : lignes d'articles, paiements, brouillon.
 * Montants en chaînes décimales, jamais de flottant (règle 10).
 */

export type Ligne = {
  cle: string;
  article: Article | null;
  /** Unité de saisie ; null = unité de base. */
  uniteId: number | null;
  quantite: string;
  /** Prix par unité saisie, FCFA entiers. */
  prix: string;
};

export type Paiement = { cle: string; compteId: number | null; montant: string; reference: string };

export type ErreursLigne = { article?: string; quantite?: string; prix?: string };
export type ErreursPaiement = { compte?: string; montant?: string };

/** Argent qui sort (achat) ou qui entre (vente) : change les libellés et le solde après. */
export type Flux = "decaissement" | "encaissement";

const QUANTITE_SAISIE = /^\d+([.,]\d{1,3})?$/;

/** Date du jour à Bamako (UTC+0 toute l'année). */
export function dateDuJour(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nouvelleLigne(): Ligne {
  return { cle: crypto.randomUUID(), article: null, uniteId: null, quantite: "", prix: "" };
}

export function nouveauPaiement(montant = ""): Paiement {
  return { cle: crypto.randomUUID(), compteId: null, montant, reference: "" };
}

export function quantiteValide(quantite: string): boolean {
  return QUANTITE_SAISIE.test(quantite) && !/^0+([.,]0*)?$/.test(quantite);
}

/** Montant d'une ligne arrondi au franc, comme la base (P-019), ou null si incomplet. */
export function montantLigne(ligne: Ligne): string | null {
  if (!ligne.article || !ligne.prix || !QUANTITE_SAISIE.test(ligne.quantite)) return null;
  return multiplierDecimaux(ligne.quantite.replace(",", "."), ligne.prix, 0);
}

export function totalDesLignes(lignes: Ligne[]): string {
  return additionnerDecimaux(lignes.map((l) => montantLigne(l) ?? "0")) ?? "0";
}

/** Partie entière d'un montant positif (« 37500.00 » → « 37500 »), "" si nul ou négatif. */
export function enFrancs(montant: string): string {
  if (montant.startsWith("-")) return "";
  const entier = montant.split(".")[0].replace(/^0+(?=\d)/, "");
  return entier === "0" ? "" : entier;
}

/**
 * Paiements tels qu'affichés : tant que l'utilisateur n'y a pas touché, le premier suit
 * le total (moins les autres paiements) et propose la Caisse, le cas le plus courant.
 */
export function paiementsAffiches(
  paiements: Paiement[],
  suitTotal: boolean,
  total: string,
  comptes: CompteTresorerie[],
): Paiement[] {
  return paiements.map((p, index) => {
    if (index !== 0 || !suitTotal) return p;
    const compteId = p.compteId ?? comptes.find((c) => c.type === "CAISSE")?.id ?? null;
    const autres = additionnerDecimaux(paiements.slice(1).map((x) => x.montant || "0")) ?? "0";
    return { ...p, compteId, montant: enFrancs(soustraireDecimaux(total, autres) ?? "0") };
  });
}

export function totalRegle(paiements: Paiement[]): string {
  return additionnerDecimaux(paiements.map((p) => p.montant || "0")) ?? "0";
}

export async function chercherArticles(texte: string, signal: AbortSignal): Promise<Article[]> {
  return chercherArticlesDeFamille(null)(texte, signal);
}

/** Recherche limitée à une famille (ex. le produit d'une recette : un semi-fini). */
export function chercherArticlesDeFamille(famille: string | null) {
  return async (texte: string, signal: AbortSignal): Promise<Article[]> => {
    const page = await appelerApi<PageArticles>("articles", {
      parametres: { recherche: texte, famille, taille: 20 },
      signal,
    });
    return page.items;
  };
}

// --- Brouillon : la saisie survit à un réseau coupé ou à un onglet fermé -------------

/** À lire après l'hydratation : le brouillon n'existe que dans le navigateur. */
export function lireBrouillon<T>(cle: string): T | null {
  try {
    const texte = window.localStorage.getItem(cle);
    return texte ? (JSON.parse(texte) as T) : null;
  } catch {
    return null;
  }
}

export function ecrireBrouillon<T>(cle: string, valeur: T | null) {
  try {
    if (valeur) window.localStorage.setItem(cle, JSON.stringify(valeur));
    else window.localStorage.removeItem(cle);
  } catch {
    // Stockage indisponible (navigation privée) : la saisie reste dans la page
  }
}

/** Ne jamais perdre une saisie : avertir avant de quitter la page (charte, section 10). */
export function useAvertirAvantDeQuitter(modifiee: boolean) {
  React.useEffect(() => {
    if (!modifiee) return;
    const avertir = (evenement: BeforeUnloadEvent) => evenement.preventDefault();
    window.addEventListener("beforeunload", avertir);
    return () => window.removeEventListener("beforeunload", avertir);
  }, [modifiee]);
}

/** Message d'échec d'un enregistrement : la saisie est toujours conservée.
 * `sansDoublon` : « l'achat ne sera pas enregistré deux fois ». */
export function messageEchec(cause: unknown, sansDoublon: string): string {
  if (!(cause instanceof ErreurApi)) {
    return "Une erreur inattendue est survenue. Votre saisie est conservée.";
  }
  if (cause.statut === 0) {
    return `La connexion a été perdue. Votre saisie est conservée : réessayez dans un instant, ${sansDoublon}.`;
  }
  return cause.message;
}
