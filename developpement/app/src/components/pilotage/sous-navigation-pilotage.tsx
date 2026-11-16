import { SousNavigation } from "@/components/ui/sous-navigation";

const ENTREES = [
  { href: "/tableau-de-bord", libelle: "Vue d'ensemble" },
  { href: "/tableau-de-bord/marges", libelle: "Marges" },
];

export function SousNavigationPilotage() {
  return (
    <div className="print:hidden">
      <SousNavigation libelle="Tableau de bord" entrees={ENTREES} />
    </div>
  );
}
