"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const ENTREES = [
  { href: "/stocks", libelle: "État des stocks" },
  { href: "/stocks/mouvements", libelle: "Mouvements" },
  { href: "/stocks/inventaires", libelle: "Inventaires" },
];

/** Sous-parties de Stocks : le menu principal garde ses six entrées (charte, section 6). */
export function SousNavigationStocks() {
  const chemin = usePathname();
  return (
    <nav aria-label="Stocks" className="flex gap-1 overflow-x-auto border-b border-bordure">
      {ENTREES.map(({ href, libelle }) => {
        const actif = href === "/stocks" ? chemin === href : chemin.startsWith(href);
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
            {libelle}
          </Link>
        );
      })}
    </nav>
  );
}
