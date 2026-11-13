import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Tableau (section 7) : pas de zébrage ni de bordure verticale, en-tête fixe,
 * lignes de 52 px sur tablette et 40 px sur bureau. Nombres à droite (`numerique`).
 */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn("w-full border-collapse text-sm", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("sticky top-0 z-10 bg-fond-doux", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={className} {...props} />;
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t border-bordure font-semibold", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-bordure transition-colors data-[state=selected]:bg-fond-actif [tbody>&]:hover:bg-fond-survol",
        className,
      )}
      {...props}
    />
  );
}

type CelluleProps = { numerique?: boolean };

function TableHead({
  className,
  numerique = false,
  ...props
}: React.ComponentProps<"th"> & CelluleProps) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-3 text-left align-middle text-libelle font-medium whitespace-nowrap text-texte-2",
        numerique && "text-right",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({
  className,
  numerique = false,
  ...props
}: React.ComponentProps<"td"> & CelluleProps) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "h-13 px-3 align-middle lg:h-10",
        numerique && "text-right whitespace-nowrap tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-xs text-texte-2", className)}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
