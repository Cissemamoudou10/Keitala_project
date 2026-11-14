"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

/**
 * Recherche avec attente de 250 ms après la frappe (charte, section 13) : on ne
 * questionne pas l'API à chaque lettre.
 */
export function ChampRecherche({
  valeur,
  onChange,
  libelle,
  placeholder,
}: {
  valeur: string;
  onChange: (valeur: string) => void;
  libelle: string;
  placeholder?: string;
}) {
  const [texte, setTexte] = React.useState(valeur);
  const dernierEnvoi = React.useRef(valeur);

  // Valeur changée de l'extérieur (retour arrière du navigateur, filtre effacé)
  React.useEffect(() => {
    if (valeur !== dernierEnvoi.current) {
      dernierEnvoi.current = valeur;
      setTexte(valeur);
    }
  }, [valeur]);

  React.useEffect(() => {
    if (texte === dernierEnvoi.current) return;
    const minuterie = window.setTimeout(() => {
      dernierEnvoi.current = texte;
      onChange(texte);
    }, 250);
    return () => window.clearTimeout(minuterie);
  }, [texte, onChange]);

  return (
    <div className="relative w-full max-w-sm">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-texte-2"
      />
      <Input
        type="search"
        aria-label={libelle}
        placeholder={placeholder ?? libelle}
        value={texte}
        onChange={(evenement) => setTexte(evenement.target.value)}
        className="pl-9"
      />
    </div>
  );
}
