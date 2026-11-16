"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type EntreeSousNavigation = { href: string; libelle: string };

/**
 * Sous-parties d'un module : le menu principal garde ses six entrées (charte, section 6).
 * La première entrée (racine du module) n'est active que sur sa propre adresse.
 * Lit `usePathname()` : à placer sous <Suspense> (Cache Components de Next 16).
 */
export function SousNavigation({
  libelle,
  entrees,
}: {
  libelle: string;
  entrees: EntreeSousNavigation[];
}) {
  const chemin = usePathname();
  return (
    <nav aria-label={libelle} className="flex gap-1 overflow-x-auto border-b border-bordure">
      {entrees.map(({ href, libelle: texte }, index) => {
        const actif = index === 0 ? chemin === href : chemin.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={actif ? "page" : undefined}
            className={cn(
              "-mb-px flex h-11 shrink-0 items-center border-b-2 px-3 text-texte-2 transition-colors hover:text-texte lg:h-9",
              actif ? "border-accent font-medium text-texte" : "border-transparent",
            )}
          >
            {texte}
          </Link>
        );
      })}
    </nav>
  );
}
