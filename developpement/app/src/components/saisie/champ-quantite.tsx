"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { estInferieur, multiplierDecimaux } from "@/lib/decimal";
import { formaterConversion, formaterQuantite } from "@/lib/formats";
import { cn } from "@/lib/utils";

export type UniteSaisie = { id: number; libelle: string; facteur_vers_base: string };

/** Quantité en unité de base (chaîne décimale), ou null si la saisie est incomplète. */
export function quantiteEnBase(
  quantite: string,
  uniteId: number | null,
  unites: UniteSaisie[],
): string | null {
  if (!/^\d+([.,]\d{1,3})?$/.test(quantite.trim())) return null;
  const facteur = unites.find((unite) => unite.id === uniteId)?.facteur_vers_base ?? "1";
  return multiplierDecimaux(quantite.trim(), facteur, 3);
}

/** Garde chiffres et une virgule (3 décimales au plus) pendant la frappe. */
function nettoyer(texte: string): string {
  const [entier = "", ...reste] = texte
    .replace(/\./g, ",")
    .replace(/[^\d,]/g, "")
    .split(",");
  return reste.length > 0 ? `${entier},${reste.join("").slice(0, 3)}` : entier;
}

type ChampQuantiteProps = {
  quantite: string;
  onQuantiteChange: (quantite: string) => void;
  /** Unité choisie ; null = unité de base. */
  uniteId: number | null;
  onUniteChange: (uniteId: number | null) => void;
  uniteBase: string;
  unites: UniteSaisie[];
  /** Stock disponible en unité de base : affiché, et la saisie passe en erreur au-delà. */
  disponible?: string;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
};

/**
 * Quantité + choix de l'unité (US-REF-02, charte section 9) : bouton à plusieurs
 * positions (« kg | Sac 50 kg »), conversion affichée dessous, stock disponible.
 */
export function ChampQuantite({
  quantite,
  onQuantiteChange,
  uniteId,
  onUniteChange,
  uniteBase,
  unites,
  disponible,
  id,
  "aria-describedby": decritPar,
  "aria-invalid": invalide,
}: ChampQuantiteProps) {
  const idInfo = React.useId();
  const enBase = quantiteEnBase(quantite, uniteId, unites);
  const unite = unites.find((u) => u.id === uniteId);
  const depasse =
    disponible !== undefined && enBase !== null && estInferieur(disponible, enBase) === true;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={quantite}
          onChange={(evenement) => onQuantiteChange(nettoyer(evenement.target.value))}
          aria-invalid={invalide || depasse || undefined}
          aria-describedby={[decritPar, idInfo].filter(Boolean).join(" ")}
          className="w-32 tabular-nums"
        />
        {unites.length > 0 && (
          <div role="group" aria-label="Unité de saisie" className="flex flex-wrap gap-1">
            {[{ id: null, libelle: uniteBase }, ...unites].map((choix) => (
              <button
                key={choix.id ?? "base"}
                type="button"
                aria-pressed={choix.id === uniteId}
                onClick={() => onUniteChange(choix.id)}
                className={cn(
                  "h-11 rounded-sm border px-3 transition-colors lg:h-9",
                  choix.id === uniteId
                    ? "border-accent bg-accent-doux font-medium text-texte"
                    : "border-bordure-forte bg-fond text-texte-2 hover:bg-fond-survol",
                )}
              >
                {choix.libelle}
              </button>
            ))}
          </div>
        )}
      </div>
      <p id={idInfo} className="flex flex-wrap gap-x-4 text-xs text-texte-2" aria-live="polite">
        {unite && enBase !== null && (
          <span className="tabular-nums">
            {formaterConversion(quantite.replace(",", "."), unite.libelle, enBase, uniteBase)}
          </span>
        )}
        {disponible !== undefined && (
          <span className={cn("tabular-nums", depasse && "text-libelle text-danger")}>
            {depasse
              ? `Il reste ${formaterQuantite(disponible, uniteBase)}. Réduisez la quantité.`
              : `Disponible : ${formaterQuantite(disponible, uniteBase)}`}
          </span>
        )}
      </p>
    </div>
  );
}
