"use client";

import * as React from "react";

import { Label } from "@/components/ui/label";

/** Attributs à poser sur le contrôle pour le relier à son libellé et à ses messages. */
export type ControleChamp = {
  id: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
};

type ChampProps = {
  libelle: string;
  /** Les champs sont obligatoires par défaut ; on marque ceux qui ne le sont pas. */
  facultatif?: boolean;
  /** Indication sous le champ, ex. « Disponible : 150 kg ». */
  aide?: React.ReactNode;
  /** Message qui dit comment corriger. */
  erreur?: string;
  children: (controle: ControleChamp) => React.ReactNode;
};

/**
 * Bloc libellé + contrôle + aide + erreur (charte, sections 7 et 13).
 *
 * <Champ libelle="Quantité" erreur={...}>
 *   {(controle) => <Input inputMode="decimal" {...controle} />}
 * </Champ>
 */
function Champ({ libelle, facultatif = false, aide, erreur, children }: ChampProps) {
  const id = React.useId();
  const idAide = `${id}-aide`;
  const idErreur = `${id}-erreur`;
  const descriptions = [aide ? idAide : null, erreur ? idErreur : null].filter(Boolean);

  return (
    <div data-slot="champ" className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {libelle}
        {facultatif && <span className="font-normal text-texte-2"> (facultatif)</span>}
      </Label>
      {children({
        id,
        "aria-invalid": erreur ? true : undefined,
        "aria-describedby": descriptions.length > 0 ? descriptions.join(" ") : undefined,
      })}
      {aide && (
        <p id={idAide} className="text-xs text-texte-2">
          {aide}
        </p>
      )}
      {erreur && (
        <p id={idErreur} className="text-libelle text-danger">
          {erreur}
        </p>
      )}
    </div>
  );
}

export { Champ };
