import { SousNavigation } from "@/components/ui/sous-navigation";

const ENTREES = [
  { href: "/production", libelle: "Ordres de fabrication" },
  { href: "/production/recettes", libelle: "Recettes" },
];

export function SousNavigationProduction() {
  return <SousNavigation libelle="Production" entrees={ENTREES} />;
}
