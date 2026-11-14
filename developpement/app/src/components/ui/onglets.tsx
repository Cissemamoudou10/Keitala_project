import { cn } from "@/lib/utils";

export type Onglet<V extends string> = { valeur: V; libelle: string; nombre?: number };

/**
 * Filtre en onglets (familles d'articles, types de tiers). La valeur active est gardée
 * dans l'adresse de la page par l'appelant (charte, section 7).
 */
export function Onglets<V extends string>({
  onglets,
  actif,
  onChange,
  libelleAccessible,
}: {
  onglets: Onglet<V>[];
  actif: V;
  onChange: (valeur: V) => void;
  libelleAccessible: string;
}) {
  return (
    <div
      role="group"
      aria-label={libelleAccessible}
      className="flex gap-1 overflow-x-auto border-b border-bordure"
    >
      {onglets.map((onglet) => {
        const selectionne = onglet.valeur === actif;
        return (
          <button
            key={onglet.valeur}
            type="button"
            aria-pressed={selectionne}
            onClick={() => onChange(onglet.valeur)}
            className={cn(
              "-mb-px flex h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 whitespace-nowrap text-texte-2 transition-colors hover:text-texte lg:h-9",
              selectionne ? "border-accent font-medium text-texte" : "border-transparent",
            )}
          >
            {onglet.libelle}
            {onglet.nombre !== undefined && (
              <span className="text-xs text-texte-2 tabular-nums">{onglet.nombre}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
