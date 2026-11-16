import { SousNavigation } from "@/components/ui/sous-navigation";

const ENTREES = [
  { href: "/tresorerie", libelle: "Comptes" },
  { href: "/tresorerie/journal", libelle: "Journal" },
  { href: "/tresorerie/depenses", libelle: "Dépenses" },
  { href: "/tresorerie/transferts", libelle: "Transferts" },
  { href: "/tresorerie/clotures", libelle: "Clôtures" },
];

export function SousNavigationTresorerie() {
  return <SousNavigation libelle="Trésorerie" entrees={ENTREES} />;
}
