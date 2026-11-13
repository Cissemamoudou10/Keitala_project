import { createCn } from "cn/config";

/**
 * Fusion de classes Tailwind (équivalent clsx + tailwind-merge, paquet de shadcn).
 * Les tailles de texte de la charte sont déclarées pour ne pas être confondues avec
 * les couleurs (`text-libelle` est une taille, `text-texte` une couleur).
 */
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [{ text: ["titre-page", "titre-section", "libelle", "chiffre-cle"] }],
      shadow: [{ shadow: ["flottant"] }],
    },
  },
});
