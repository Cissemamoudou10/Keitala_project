"use client";

import { Input } from "@/components/ui/input";
import { additionnerDecimaux, multiplierDecimaux } from "@/lib/decimal";
import { formaterMontant, formaterMontantSeul } from "@/lib/formats";

/** Coupures du franc CFA (BCEAO) en circulation : billets puis pièces. */
export const COUPURES = [
  { cle: "b10000", valeur: "10000", nature: "Billet" },
  { cle: "b5000", valeur: "5000", nature: "Billet" },
  { cle: "b2000", valeur: "2000", nature: "Billet" },
  { cle: "b1000", valeur: "1000", nature: "Billet" },
  { cle: "b500", valeur: "500", nature: "Billet" },
  { cle: "p500", valeur: "500", nature: "Pièce" },
  { cle: "p250", valeur: "250", nature: "Pièce" },
  { cle: "p200", valeur: "200", nature: "Pièce" },
  { cle: "p100", valeur: "100", nature: "Pièce" },
  { cle: "p50", valeur: "50", nature: "Pièce" },
  { cle: "p25", valeur: "25", nature: "Pièce" },
  { cle: "p10", valeur: "10", nature: "Pièce" },
  { cle: "p5", valeur: "5", nature: "Pièce" },
] as const;

export type Nombres = Record<string, string>;

/** Total du billetage en FCFA (chaîne entière), calcul exact. */
export function totalBilletage(nombres: Nombres): string {
  const montants = COUPURES.map(
    ({ cle, valeur }) => multiplierDecimaux(nombres[cle] || "0", valeur, 0) ?? "0",
  );
  return additionnerDecimaux(montants) ?? "0";
}

/**
 * Billetage de la clôture (US-TRES-04) : nombre de billets et de pièces par coupure ;
 * le montant compté s'en déduit, sans calcul à la main.
 */
export function Billetage({
  nombres,
  onChange,
}: {
  nombres: Nombres;
  onChange: (nombres: Nombres) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-md border border-bordure p-4">
      <legend className="px-1 font-medium">Billets et pièces</legend>
      <div className="flex flex-col gap-2">
        {COUPURES.map(({ cle, valeur, nature }) => {
          const libelle = `${nature} de ${formaterMontant(valeur)}`;
          const sousTotal = multiplierDecimaux(nombres[cle] || "0", valeur, 0) ?? "0";
          return (
            <label key={cle} className="flex items-center gap-3">
              <span className="w-40 text-texte-2">{libelle}</span>
              <Input
                inputMode="numeric"
                autoComplete="off"
                aria-label={`Nombre : ${libelle}`}
                className="w-20 tabular-nums"
                value={nombres[cle] ?? ""}
                onChange={(e) =>
                  onChange({ ...nombres, [cle]: e.target.value.replace(/\D/g, "").slice(0, 6) })
                }
              />
              <span className="ml-auto text-texte-2 tabular-nums">
                {sousTotal === "0" ? "" : formaterMontantSeul(sousTotal)}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
