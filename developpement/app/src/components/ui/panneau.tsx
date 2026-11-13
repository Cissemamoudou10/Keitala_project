"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Panneau latéral à droite (charte, section 6) : détail ou formulaire sans quitter la
 * liste. 560 px sur bureau, pleine largeur sur téléphone. Échap ferme, le focus y reste.
 */
export function Panneau({
  ouvert,
  onOuvertChange,
  titre,
  description,
  children,
}: {
  ouvert: boolean;
  onOuvertChange: (ouvert: boolean) => void;
  titre: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={ouvert} onOpenChange={onOuvertChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-voile data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col bg-fond shadow-flottant data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
          {...(description ? {} : { "aria-describedby": undefined })}
        >
          <div className="flex items-start justify-between gap-4 border-b border-bordure px-6 py-4">
            <div className="flex flex-col gap-1">
              <DialogPrimitive.Title className="text-titre-section font-semibold">
                {titre}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-texte-2">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="discret" size="icone" aria-label="Fermer" title="Fermer">
                <XIcon />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
