"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ChampChoixProps<T> = {
  /** Élément choisi, ou null. */
  valeur: T | null;
  onChoix: (element: T | null) => void;
  libelleDe: (element: T) => string;
  cleDe: (element: T) => string;
  /** Suggestions pour le texte saisi (attente de 250 ms entre deux appels). */
  rechercher: (texte: string, signal: AbortSignal) => Promise<T[]>;
  cleRequete: readonly unknown[];
  /** Contenu d'une suggestion ; par défaut, son libellé. */
  rendreOption?: (element: T) => React.ReactNode;
  /** Texte libre saisi sans choisir (ex. fournisseur hors répertoire). */
  onTexteChange?: (texte: string) => void;
  texteInitial?: string;
  placeholder?: string;
  autoFocus?: boolean;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
};

/**
 * Champ de recherche avec suggestions (charte, section 9) : on tape quelques lettres,
 * flèches et Entrée pour choisir, Échap pour fermer. Sert aux articles et aux tiers.
 * Le texte part de la valeur initiale : changer la `key` pour le réinitialiser.
 */
export function ChampChoix<T>({
  valeur,
  onChoix,
  libelleDe,
  cleDe,
  rechercher,
  cleRequete,
  rendreOption,
  onTexteChange,
  texteInitial,
  placeholder,
  autoFocus,
  id,
  "aria-describedby": decritPar,
  "aria-invalid": invalide,
}: ChampChoixProps<T>) {
  const idListe = React.useId();
  const [texte, setTexte] = React.useState(() =>
    valeur ? libelleDe(valeur) : (texteInitial ?? ""),
  );
  const [attendu, setAttendu] = React.useState(texte);
  const [ouvert, setOuvert] = React.useState(false);
  const [actif, setActif] = React.useState(0);

  React.useEffect(() => {
    const minuterie = window.setTimeout(() => setAttendu(texte), 250);
    return () => window.clearTimeout(minuterie);
  }, [texte]);

  const recherche = valeur && texte === libelleDe(valeur) ? "" : attendu.trim();
  const suggestions = useQuery({
    queryKey: [...cleRequete, recherche],
    queryFn: ({ signal }) => rechercher(recherche, signal),
    enabled: ouvert,
    placeholderData: (precedent) => precedent,
  });
  const options = suggestions.data ?? [];

  const choisir = (element: T) => {
    onChoix(element);
    setTexte(libelleDe(element));
    setOuvert(false);
  };

  const gererTouche = (evenement: React.KeyboardEvent<HTMLInputElement>) => {
    if (evenement.key === "ArrowDown") {
      evenement.preventDefault();
      setOuvert(true);
      setActif((index) => Math.min(index + 1, options.length - 1));
    } else if (evenement.key === "ArrowUp") {
      evenement.preventDefault();
      setActif((index) => Math.max(index - 1, 0));
    } else if (evenement.key === "Enter" && ouvert && options[actif]) {
      evenement.preventDefault();
      choisir(options[actif]);
    } else if (evenement.key === "Escape" && ouvert) {
      // Ferme la liste sans fermer le panneau qui contient le champ
      evenement.stopPropagation();
      setOuvert(false);
    }
  };

  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={ouvert}
        aria-controls={idListe}
        aria-autocomplete="list"
        aria-activedescendant={ouvert && options[actif] ? `${idListe}-${actif}` : undefined}
        aria-describedby={decritPar}
        aria-invalid={invalide}
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={texte}
        onChange={(evenement) => {
          setTexte(evenement.target.value);
          setOuvert(true);
          setActif(0);
          if (valeur) onChoix(null);
          onTexteChange?.(evenement.target.value);
        }}
        onFocus={() => setOuvert(true)}
        onBlur={() => setOuvert(false)}
        onKeyDown={gererTouche}
      />
      {ouvert && (
        <ul
          id={idListe}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-bordure bg-fond py-1 shadow-flottant"
        >
          {options.map((element, index) => (
            <li
              key={cleDe(element)}
              id={`${idListe}-${index}`}
              role="option"
              aria-selected={index === actif}
              // Garde le focus dans le champ : le clic choisit avant la fermeture
              onMouseDown={(evenement) => evenement.preventDefault()}
              onClick={() => choisir(element)}
              onMouseEnter={() => setActif(index)}
              className={cn(
                "flex min-h-11 cursor-pointer items-center px-3 py-1.5 lg:min-h-9",
                index === actif && "bg-fond-survol",
              )}
            >
              {rendreOption ? rendreOption(element) : libelleDe(element)}
            </li>
          ))}
          {options.length === 0 && (
            <li className="px-3 py-2 text-texte-2">
              {suggestions.isFetching ? "Recherche…" : "Aucun résultat."}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
