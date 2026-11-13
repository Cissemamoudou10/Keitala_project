/**
 * État « vide » (charte, section 7) : une phrase qui explique et, si l'utilisateur
 * peut agir, le bouton pour commencer. Ex. « Aucune vente aujourd'hui. » + « Nouvelle vente ».
 * Pour le Consultant, ne pas passer d'action (il ne peut rien créer).
 */
export function EtatVide({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
      <p className="text-texte-2">{message}</p>
      {action}
    </div>
  );
}
