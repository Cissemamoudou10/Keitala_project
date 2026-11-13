import { cn } from "@/lib/utils";

/**
 * État « chargement » (charte, section 7) : un squelette de la forme du contenu,
 * jamais de page blanche ni de roue seule au centre.
 */
export function Squelette({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-sm bg-fond-survol", className)} />;
}

function ZoneChargement({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">Chargement…</span>
      {children}
    </div>
  );
}

/** Squelette d'un tableau : en-tête puis lignes aux hauteurs du vrai tableau. */
export function SqueletteTableau({ lignes = 8, colonnes = 4 }: { lignes?: number; colonnes?: number }) {
  const cellules = Array.from({ length: colonnes });
  return (
    <ZoneChargement>
      <div className="flex h-10 items-center gap-6 bg-fond-doux px-3">
        {cellules.map((_, i) => (
          <Squelette key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: lignes }).map((_, ligne) => (
        <div key={ligne} className="flex h-13 items-center gap-6 border-b border-bordure px-3 lg:h-10">
          {cellules.map((_, i) => (
            <Squelette key={i} className={cn("h-3 flex-1", i === 0 && "flex-[2]")} />
          ))}
        </div>
      ))}
    </ZoneChargement>
  );
}

/** Squelette de chiffres clés (tableau de bord). */
export function SqueletteChiffresCles({ nombre = 4 }: { nombre?: number }) {
  return (
    <ZoneChargement className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: nombre }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-md border border-bordure p-4">
          <Squelette className="h-3 w-24" />
          <Squelette className="h-6 w-32" />
        </div>
      ))}
    </ZoneChargement>
  );
}

/** Squelette d'un formulaire : libellés et champs. */
export function SqueletteFormulaire({ champs = 4 }: { champs?: number }) {
  return (
    <ZoneChargement className="flex max-w-[720px] flex-col gap-6">
      {Array.from({ length: champs }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Squelette className="h-3 w-28" />
          <Squelette className="h-11 w-full lg:h-9" />
        </div>
      ))}
    </ZoneChargement>
  );
}
