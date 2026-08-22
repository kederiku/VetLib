/**
 * Source de vérité de la navigation du back-office plateforme.
 *
 * Comme dans les deux portails : la sidebar (liste des liens) ET le header
 * (titre de la page courante) lisent ce module. Ajouter un écran = ajouter
 * UNE entrée ici, sans toucher ni à la sidebar ni au header.
 *
 * Aucune permission sur les entrées, contrairement au B2B : cet espace n'a
 * qu'un seul rôle. Le jour où un rôle « support » en lecture seule
 * apparaîtra, on recopiera le champ `permission` du portail clinique — pas
 * avant : une permission unique est une permission inutile.
 *
 * URLs en français, comme les libellés et les titres. Trois raisons : aucun
 * enjeu de référencement (la console est en noindex), le vocabulaire métier
 * est français et n'a pas d'équivalent net dans le code (« propriétaires »
 * quand l'API dit `owners`, « personnel » quand elle dit `users`), et surtout
 * le libellé du menu, le titre de la page et le segment d'URL deviennent le
 * MEME mot — ce qui rend `pageTitleForPath` évident au lieu d'être une table
 * de correspondance mentale.
 */
import {
  Building2Icon,
  LayoutDashboardIcon,
  StethoscopeIcon,
  UsersIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  /** Type d'un composant d'icône lucide-react (rendu par l'appelant). */
  icon: React.ComponentType<{ className?: string }>;
};

export const NAV_ITEMS: NavItem[] = [
  { title: "Tableau de bord", href: "/tableau-de-bord", icon: LayoutDashboardIcon },
  { title: "Cliniques", href: "/cliniques", icon: Building2Icon },
  { title: "Propriétaires", href: "/proprietaires", icon: UsersIcon },
  { title: "Personnel", href: "/personnel", icon: StethoscopeIcon },
];

/**
 * Titre de la page courante pour le header, à partir du pathname.
 *
 * Match par PRÉFIXE, comme l'indicateur d'item actif de la sidebar : la fiche
 * /cliniques/<uuid> garde le titre « Cliniques » (le nom de la clinique, lui,
 * est le <h1> de la page, pas le fil du header). Retourne null hors des
 * écrans connus, le header n'affiche alors rien.
 */
export function pageTitleForPath(pathname: string): string | null {
  return NAV_ITEMS.find((item) => pathname.startsWith(item.href))?.title ?? null;
}
