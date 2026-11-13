"use client";

import { Button } from "@/components/ui/button";
import { ErreurApi } from "@/lib/api";

const MESSAGE_PAR_DEFAUT = "Les données n'ont pas pu être chargées.";

/** Message à afficher pour une erreur quelconque : celui de l'API s'il existe. */
export function messageErreur(erreur: unknown): string {
  return erreur instanceof ErreurApi ? erreur.message : MESSAGE_PAR_DEFAUT;
}

/**
 * État « erreur » (charte, section 7) : ce qui s'est passé, en clair, et « Réessayer ».
 */
export function EtatErreur({
  erreur,
  onReessayer,
  enCours = false,
}: {
  erreur: unknown;
  onReessayer?: () => void;
  /** Nouvel essai en cours : bouton bloqué. */
  enCours?: boolean;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-4 rounded-md bg-danger-fond px-6 py-12 text-center"
    >
      <p className="text-danger">{messageErreur(erreur)}</p>
      {onReessayer && (
        <Button onClick={onReessayer} enCours={enCours} libelleEnCours="Nouvel essai…">
          Réessayer
        </Button>
      )}
    </div>
  );
}
