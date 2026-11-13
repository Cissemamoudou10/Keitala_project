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

export type Role = "SUPER_ADMIN" | "GESTIONNAIRE" | "CONSULTANT";

export type EntreeNavigation = {
  libelle: string;
  href: string;
  icone: LucideIcon;
  /** Entrée réservée au Super Admin (charte, section 6). */
  superAdminSeulement?: boolean;
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
    superAdminSeulement: true,
  },
];

export function entreesPourRole(role: Role | null): EntreeNavigation[] {
  return ENTREES_NAVIGATION.filter(
    (entree) => !entree.superAdminSeulement || role === "SUPER_ADMIN",
  );
}

export function estActive(href: string, cheminCourant: string): boolean {
  return cheminCourant === href || cheminCourant.startsWith(`${href}/`);
}
