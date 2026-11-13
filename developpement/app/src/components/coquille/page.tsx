import * as React from "react";

import { cn } from "@/lib/utils";

type PageProps = {
  titre: string;
  /** Ligne de description facultative sous le titre. */
  description?: string;
  /** L'action principale de l'écran (un seul bouton plein), à droite du titre. */
  action?: React.ReactNode;
  /** Largeur maximale : 1 200 px pour un tableau, 720 px pour un formulaire. */
  largeur?: "tableau" | "formulaire";
  children?: React.ReactNode;
};

/** Mise en page d'un écran : en-tête (titre, description, action) puis contenu. */
export function Page({ titre, description, action, largeur = "tableau", children }: PageProps) {
  return (
    <div
      className={cn(
        "flex w-full flex-col gap-6 px-4 py-6 md:px-8 md:py-8 lg:px-12 lg:py-12",
        largeur === "tableau" ? "max-w-[1200px]" : "max-w-[720px]",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-titre-page font-semibold">{titre}</h1>
          {description && <p className="text-texte-2">{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </div>
  );
}
