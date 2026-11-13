import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Étiquette d'état (section 7) : texte foncé sur fond pastel, 12 px, graisse 500.
 * La couleur accompagne toujours un mot : ne jamais afficher une étiquette vide.
 */
const badgeVariants = cva(
  "inline-flex h-5 w-fit shrink-0 items-center gap-1 rounded-sm px-1.5 text-xs font-medium whitespace-nowrap [&>svg]:size-3",
  {
    variants: {
      variant: {
        succes: "bg-succes-fond text-succes",
        attention: "bg-attention-fond text-attention",
        danger: "bg-danger-fond text-danger",
        info: "bg-info-fond text-info",
        neutre: "bg-neutre-fond text-neutre",
      },
    },
    defaultVariants: {
      variant: "neutre",
    },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
