import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Champ de saisie (section 7). 44 px et texte 16 px sur tablette (évite le zoom
 * automatique), 36 px et 14 px sur bureau. Erreur signalée par `aria-invalid`.
 */
function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-sm border border-bordure-forte bg-fond px-3 text-base text-texte transition-colors lg:h-9 lg:text-sm",
        "placeholder:text-texte-3",
        "focus-visible:border-accent focus-visible:outline-offset-0",
        "aria-invalid:border-danger aria-invalid:focus-visible:outline-danger",
        "disabled:cursor-not-allowed disabled:bg-fond-doux disabled:text-texte-3",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
