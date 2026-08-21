/**
 * Source de vérité de la navigation du portail B2B.
 *
 * La sidebar (liste des liens) et le header (titre de la page courante)
 * lisent tous deux ce module : ajouter un écran = ajouter UNE entrée
 * ici, sans toucher ni à la sidebar ni au header. Chaque entrée peut
 * déclarer une permission : les composants la filtrent via la fonction
 * pure hasPermission (cacher un lien n'est pas une protection, le
 * backend garde l'autorité — voir src/lib/auth/permissions.ts).
 */
import { CalendarDaysIcon, LayoutDashboardIcon, SettingsIcon } from "lucide-react";

import type { Permission } from "@/lib/auth/permissions";

export type NavItem = {
  title: string;
  href: string;
  // Type d'un composant d'icône lucide-react (rendu par l'appelant).
  icon: React.ComponentType<{ className?: string }>;
  /** Permission requise pour VOIR le lien ; absente = visible par tous. */
  permission?: Permission;
};

export const NAV_ITEMS: NavItem[] = [
  { title: "Tableau de bord", href: "/dashboard", icon: LayoutDashboardIcon },
  { title: "Agenda", href: "/agenda", icon: CalendarDaysIcon },
  {
    title: "Réglages",
    href: "/reglages",
    icon: SettingsIcon,
    permission: "clinic:manage",
  },
];

/**
 * Titre de la page courante pour le header, à partir du pathname.
 *
 * Match par PREFIXE (comme l'indicateur d'item actif de la sidebar) :
 * une future sous-page /agenda/xxx garde le titre "Agenda". Retourne
 * null hors des écrans connus (le header n'affiche alors rien).
 */
export function pageTitleForPath(pathname: string): string | null {
  return (
    NAV_ITEMS.find((item) => pathname.startsWith(item.href))?.title ?? null
  );
}
