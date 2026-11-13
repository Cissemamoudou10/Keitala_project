import { toast } from "sonner";

type Lien = { libelle: string; href: string };

/**
 * Notifications de la charte (section 7) : une phrase, 4 secondes, un lien vers la
 * pièce si utile. Les erreurs restent affichées jusqu'à leur fermeture.
 */
export const notifier = {
  succes(message: string, lien?: Lien) {
    toast.success(message, {
      action: lien
        ? { label: lien.libelle, onClick: () => window.location.assign(lien.href) }
        : undefined,
    });
  },
  erreur(message: string) {
    toast.error(message, { duration: Number.POSITIVE_INFINITY });
  },
};
