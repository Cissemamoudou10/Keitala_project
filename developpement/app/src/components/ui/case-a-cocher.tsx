import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Case à cocher avec son libellé, cible de 44 px sur tablette (charte, section 13).
 * Case native : accessible au clavier et aux lecteurs d'écran sans effort.
 */
export function CaseACocher({
  libelle,
  aide,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { libelle: string; aide?: string }) {
  const id = React.useId();
  return (
    <label
      htmlFor={props.id ?? id}
      className={cn(
        "flex min-h-11 cursor-pointer items-start gap-3 py-2 select-none lg:min-h-8 lg:py-1",
        props.disabled && "cursor-not-allowed text-texte-3",
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-5 shrink-0 cursor-[inherit] accent-accent lg:size-4"
        {...props}
      />
      <span className="flex flex-col gap-0.5">
        <span>{libelle}</span>
        {aide && <span className="text-xs text-texte-2">{aide}</span>}
      </span>
    </label>
  );
}
