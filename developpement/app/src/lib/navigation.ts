import {
  ArrowDownToLine,
  Factory,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { peut, type Action, type Role } from "@/lib/droits";

export type { Role };

export type EntreeNavigation = {
  libelle: string;
  href: string;
  icone: LucideIcon;
  /** Entrée affichée seulement si le rôle peut faire cette action (lib/droits). */
  action?: Action;
};

/** Six entrées au plus, plus « Administration » pour le Super Admin. */
export const ENTREES_NAVIGATION: EntreeNavigation[] = [
  { libelle: "Tableau de bord", href: "/tableau-de-bord", icone: LayoutDashboard },
  { libelle: "Stocks", href: "/stocks", icone: Package },
  { libelle: "Achats", href: "/achats", icone: ArrowDownToLine },
  { libelle: "Ventes", href: "/ventes", icone: ShoppingCart },
  { libelle: "Production", href: "/production", icone: Factory },
  { libelle: "Trésorerie", href: "/tresorerie", icone: Wallet },
  {
    libelle: "Administration",
    href: "/administration",
    icone: Settings,
    action: "gerer_utilisateurs",
  },
];

export function entreesPourRole(role: Role | null): EntreeNavigation[] {
  return ENTREES_NAVIGATION.filter((entree) => !entree.action || peut(role, entree.action));
}

export function estActive(href: string, cheminCourant: string): boolean {
  return cheminCourant === href || cheminCourant.startsWith(`${href}/`);
}
