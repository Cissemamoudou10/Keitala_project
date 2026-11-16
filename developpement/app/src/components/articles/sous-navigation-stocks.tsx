import { SousNavigation } from "@/components/ui/sous-navigation";

const ENTREES = [
  { href: "/stocks", libelle: "État des stocks" },
  { href: "/stocks/mouvements", libelle: "Mouvements" },
  { href: "/stocks/inventaires", libelle: "Inventaires" },
];

export function SousNavigationStocks() {
  return <SousNavigation libelle="Stocks" entrees={ENTREES} />;
}
