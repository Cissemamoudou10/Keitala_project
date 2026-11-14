import { Suspense } from "react";

import { CatalogueArticles } from "@/components/articles/catalogue-articles";

// Stocks : catalogue des articles (US-STK-01, US-REF-02). État valorisé, alertes,
// journal et inventaires : Sprint 3. Filtres lus dans l'adresse : rendu navigateur.
export default function PageStocks() {
  return (
    <Suspense>
      <CatalogueArticles />
    </Suspense>
  );
}
