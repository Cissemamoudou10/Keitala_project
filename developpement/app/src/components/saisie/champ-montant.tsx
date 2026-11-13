"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { ESPACE_INSECABLE } from "@/lib/formats";
import { cn } from "@/lib/utils";

// DECIMAL(15, 2) en base : 13 chiffres avant la virgule au plus
const CHIFFRES_MAX = 13;

function grouper(chiffres: string): string {
  return chiffres.replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE_INSECABLE);
}

/** Position dans le texte affiché juste après le n-ième chiffre. */
function positionApresChiffres(affiche: string, nombreDeChiffres: number): number {
  if (nombreDeChiffres <= 0) return 0;
  let vus = 0;
  for (let i = 0; i < affiche.length; i++) {
    if (/\d/.test(affiche[i])) vus++;
    if (vus === nombreDeChiffres) return i + 1;
  }
  return affiche.length;
}

type ChampMontantProps = Omit<
  React.ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "type" | "inputMode"
> & {
  /** Montant en FCFA, chiffres seuls ("2030000"), ou "" si vide. */
  value: string;
  onChange: (valeur: string) => void;
};

/**
 * Saisie d'un montant en FCFA (charte, section 9) : « 2030000 » s'affiche
 * « 2 030 000 » pendant la frappe, suffixe FCFA dans le champ, clavier numérique.
 * Compatible React Hook Form via `Controller` (value / onChange / onBlur / ref).
 */
export function ChampMontant({ value, onChange, className, ref, ...props }: ChampMontantProps) {
  const champ = React.useRef<HTMLInputElement | null>(null);
  const curseurVoulu = React.useRef<number | null>(null);
  const affiche = grouper(value);

  // Replace le curseur après le reformatage (sinon il saute en fin de champ)
  React.useLayoutEffect(() => {
    if (curseurVoulu.current !== null && champ.current === document.activeElement) {
      champ.current?.setSelectionRange(curseurVoulu.current, curseurVoulu.current);
    }
    curseurVoulu.current = null;
  });

  function lierRef(element: HTMLInputElement | null) {
    champ.current = element;
    if (typeof ref === "function") ref(element);
    else if (ref) ref.current = element;
  }

  function gererSaisie(evenement: React.ChangeEvent<HTMLInputElement>) {
    let brut = evenement.target.value;
    let curseur = evenement.target.selectionStart ?? brut.length;
    const typeSaisie = (evenement.nativeEvent as InputEvent).inputType;

    // Effacer l'espace d'un groupe efface le chiffre voisin (sinon la touche semble sans effet)
    if (brut.replace(/\D/g, "") === value && brut.length < affiche.length) {
      if (typeSaisie === "deleteContentBackward" && curseur > 0) {
        brut = brut.slice(0, curseur - 1) + brut.slice(curseur);
        curseur -= 1;
      } else if (typeSaisie === "deleteContentForward") {
        brut = brut.slice(0, curseur) + brut.slice(curseur + 1);
      }
    }

    const tousLesChiffres = brut.replace(/\D/g, "");
    const chiffres = tousLesChiffres.replace(/^0+(?=\d)/, "").slice(0, CHIFFRES_MAX);
    const zerosRetires = tousLesChiffres.length - tousLesChiffres.replace(/^0+(?=\d)/, "").length;
    const chiffresAvantCurseur = brut.slice(0, curseur).replace(/\D/g, "").length - zerosRetires;

    curseurVoulu.current = positionApresChiffres(
      grouper(chiffres),
      Math.min(Math.max(chiffresAvantCurseur, 0), chiffres.length),
    );
    onChange(chiffres);
  }

  return (
    <div className="relative">
      <Input
        ref={lierRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={affiche}
        onChange={gererSaisie}
        className={cn("pr-16 tabular-nums", className)}
        {...props}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-texte-2"
      >
        FCFA
      </span>
    </div>
  );
}
