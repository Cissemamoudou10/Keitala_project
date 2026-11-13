"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { entreesPourRole, estActive, type Role } from "@/lib/navigation";

/**
 * Coquille de l'application (charte, section 6).
 * - Bureau (≥ 1 024 px) : barre latérale de 240 px, repliable.
 * - Tablette et téléphone : barre latérale en tiroir, ouverte par le bouton « Menu ».
 */
export function Coquille({ role, children }: { role: Role | null; children: React.ReactNode }) {
  const [replie, setReplie] = React.useState(false);
  const [tiroirOuvert, setTiroirOuvert] = React.useState(false);

  return (
    <div className="flex min-h-full flex-1">
      {/* Bureau */}
      {!replie && (
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-bordure bg-fond-doux lg:flex">
          <BarreLaterale role={role}>
            <Button
              variant="discret"
              size="icone"
              onClick={() => setReplie(true)}
              aria-label="Masquer le menu"
              title="Masquer le menu"
            >
              <PanelLeftClose />
            </Button>
          </BarreLaterale>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barre du haut : tablette et téléphone, ou bureau quand le menu est masqué */}
        <div
          className={cn(
            "sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-bordure bg-fond px-2",
            !replie && "lg:hidden",
          )}
        >
          <Button variant="discret" className="lg:hidden" onClick={() => setTiroirOuvert(true)}>
            <Menu />
            Menu
          </Button>
          {replie && (
            <Button variant="discret" className="hidden lg:inline-flex" onClick={() => setReplie(false)}>
              <PanelLeftOpen />
              Afficher le menu
            </Button>
          )}
          <span className="font-semibold">Keitala</span>
        </div>

        <main className="flex-1">{children}</main>
      </div>

      {/* Tiroir : tablette et téléphone */}
      <DialogPrimitive.Root open={tiroirOuvert} onOpenChange={setTiroirOuvert}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-voile data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 lg:hidden" />
          <DialogPrimitive.Content
            className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col bg-fond-doux shadow-flottant data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 lg:hidden"
            aria-describedby={undefined}
          >
            <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
            <BarreLaterale role={role} onNaviguer={() => setTiroirOuvert(false)}>
              <DialogPrimitive.Close asChild>
                <Button variant="discret" size="icone" aria-label="Fermer le menu" title="Fermer le menu">
                  <X />
                </Button>
              </DialogPrimitive.Close>
            </BarreLaterale>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}

function BarreLaterale({
  role,
  onNaviguer,
  children,
}: {
  role: Role | null;
  onNaviguer?: () => void;
  /** Bouton de repli ou de fermeture, à droite du nom. */
  children: React.ReactNode;
}) {
  const cheminCourant = usePathname();

  return (
    <>
      <div className="flex h-14 items-center justify-between gap-2 px-4 lg:pr-2">
        <span className="font-semibold">Keitala</span>
        {children}
      </div>
      <nav aria-label="Navigation principale" className="flex-1 overflow-y-auto px-2 py-2">
        <ul className="flex flex-col gap-0.5">
          {entreesPourRole(role).map(({ href, libelle, icone: Icone }) => {
            const active = estActive(href, cheminCourant);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onNaviguer}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-sm px-2 text-texte transition-colors hover:bg-fond-survol lg:h-8",
                    active && "bg-fond-actif font-medium hover:bg-fond-actif",
                  )}
                >
                  <Icone className="size-[18px] shrink-0 text-texte-2" strokeWidth={1.5} />
                  {libelle}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
