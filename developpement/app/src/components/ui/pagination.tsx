import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Pagination côté serveur (charte, section 7) ; rien n'est affiché s'il n'y a qu'une page. */
export function Pagination({
  page,
  pagesTotal,
  total,
  onPage,
}: {
  page: number;
  pagesTotal: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (pagesTotal <= 1) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
      <span className="text-texte-2 tabular-nums">
        Page {page} sur {pagesTotal} · {total} éléments
      </span>
      <div className="flex gap-2">
        <Button onClick={() => onPage(page - 1)} disabled={page <= 1}>
          <ChevronLeft />
          Précédente
        </Button>
        <Button onClick={() => onPage(page + 1)} disabled={page >= pagesTotal}>
          Suivante
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}
