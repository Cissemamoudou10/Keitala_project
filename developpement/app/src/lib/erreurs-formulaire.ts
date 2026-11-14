import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import { ErreurApi } from "@/lib/api";

/**
 * Place une erreur de l'API sous le champ concerné quand elle en désigne un
 * (`details.champ`, ou les champs d'une erreur de validation) ; renvoie sinon le
 * message général à afficher au-dessus du bouton. Le formulaire reste rempli.
 */
export function appliquerErreurApi<T extends FieldValues>(
  erreur: unknown,
  setError: UseFormSetError<T>,
  champs: readonly Path<T>[],
): string | null {
  if (!(erreur instanceof ErreurApi)) return "Une erreur inattendue est survenue. Réessayez.";
  const connu = (nom: unknown): nom is Path<T> =>
    typeof nom === "string" && (champs as readonly string[]).includes(nom);

  const champ = erreur.details?.champ;
  if (connu(champ)) {
    setError(champ, { message: erreur.message }, { shouldFocus: true });
    return null;
  }
  if (erreur.code === "DONNEES_INVALIDES" && erreur.details) {
    let placee = false;
    for (const [nom, messages] of Object.entries(erreur.details)) {
      if (connu(nom) && Array.isArray(messages)) {
        setError(nom, { message: String(messages[0]) }, { shouldFocus: !placee });
        placee = true;
      }
    }
    if (placee) return null;
  }
  return erreur.message;
}
