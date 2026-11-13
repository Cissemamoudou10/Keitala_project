"use client";

import * as React from "react";
import { Label as LabelPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/** Libellé de champ : 13 px, graisse 500, toujours visible au-dessus du champ. */
function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn("text-libelle font-medium text-texte select-none", className)}
      {...props}
    />
  );
}

export { Label };
