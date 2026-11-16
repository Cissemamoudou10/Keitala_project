import type { Metadata } from "next";
import { Suspense } from "react";

import { Logo } from "@/components/coquille/logo";

import { FormulaireConnexion } from "./formulaire-connexion";

export const metadata: Metadata = { title: "Connexion · Keitala" };

// Écran de connexion (US-AUTH-01, S1-T2) : hors coquille, une seule action.
export default function PageConnexion() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col gap-1">
          <Logo className="mb-4 h-20 self-start" prioritaire />
          <h1 className="text-titre-page font-semibold">Connexion</h1>
          <p className="text-texte-2">Connectez-vous pour continuer.</p>
        </div>
        {/* Le formulaire lit l'adresse de retour (?suite=) : rendu côté navigateur */}
        <Suspense>
          <FormulaireConnexion />
        </Suspense>
      </div>
    </main>
  );
}
