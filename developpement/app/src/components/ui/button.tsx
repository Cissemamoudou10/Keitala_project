import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Bouton de la charte (section 7). Un seul bouton « principal » par écran.
 * Hauteur 44 px sur tablette et téléphone, 32 px sur bureau (≥ 1 024 px).
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-sm border text-sm font-medium whitespace-nowrap transition-colors select-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        principal:
          "border-transparent bg-accent text-blanc hover:bg-accent-survol disabled:hover:bg-accent",
        secondaire:
          "border-bordure-forte bg-fond text-texte hover:bg-fond-survol active:bg-fond-actif",
        discret:
          "border-transparent bg-transparent text-texte hover:bg-fond-survol active:bg-fond-actif [&_svg]:text-texte-2",
        // Réservé à la fenêtre de confirmation d'une annulation
        danger: "border-transparent bg-danger-plein text-blanc hover:brightness-95",
      },
      size: {
        normal: "h-11 px-4 lg:h-8 lg:px-3",
        icone: "size-11 lg:size-8",
      },
    },
    defaultVariants: {
      variant: "secondaire",
      size: "normal",
    },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** Envoi en cours : bouton bloqué (évite les doublons) et libellé remplacé. */
    enCours?: boolean;
    libelleEnCours?: string;
  };

function Button({
  className,
  variant,
  size,
  asChild = false,
  enCours = false,
  libelleEnCours = "Enregistrement…",
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || enCours}
      aria-busy={enCours || undefined}
      {...props}
    >
      {enCours ? libelleEnCours : children}
    </Comp>
  );
}

export { Button, buttonVariants };
