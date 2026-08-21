/**
 * Source de vérité de la navigation du portail propriétaires.
 *
 * La sidebar (liste des liens) et le header (titre de la page courante)
 * lisent tous deux ce module : ajouter un écran = ajouter UNE entrée
 * ici, sans toucher ni à la sidebar ni au header.
 *
 * Contrairement au portail clinique, aucune entrée n'est conditionnée
 * par une permission : un propriétaire n'a pas de rôle, il voit ses
 * quatre sections. Le type NavItem s'en trouve simplifié.
 */
import {
  CalendarDaysIcon,
  CircleUserIcon,
  LayoutDashboardIcon,
  PawPrintIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  // Type d'un composant d'icône lucide-react (rendu par l'appelant).
  icon: React.ComponentType<{ className?: string }>;
};

export const NAV_ITEMS: NavItem[] = [
  { title: "Tableau de bord", href: "/tableau-de-bord", icon: LayoutDashboardIcon },
  { title: "Mes rendez-vous", href: "/rendez-vous", icon: CalendarDaysIcon },
  { title: "Mes animaux", href: "/animaux", icon: PawPrintIcon },
  { title: "Mon compte", href: "/mon-compte", icon: CircleUserIcon },
];

/**
 * Sous-pages qui méritent leur PROPRE titre de header, alors qu'elles
 * appartiennent à une section de NAV_ITEMS.
 *
 * Testées AVANT NAV_ITEMS dans pageTitleForPath : "/rendez-vous/nouveau"
 * commence par "/rendez-vous", donc sans cette priorité le tunnel de
 * réservation s'intitulerait "Mes rendez-vous". Le préfixe le plus long
 * doit gagner.
 *
 * Ces entrées ne figurent PAS dans la sidebar : la prise de rendez-vous
 * est une action, pas une destination permanente.
 */
const SUB_PAGE_TITLES: Pick<NavItem, "title" | "href">[] = [
  { title: "Prendre rendez-vous", href: "/rendez-vous/nouveau" },
];

/**
 * Titre de la page courante pour le header, à partir du pathname.
 *
 * Match par PRÉFIXE (comme l'indicateur d'entrée active de la sidebar) :
 * une sous-page /animaux/<id> garde le titre "Mes animaux". Retourne
 * null hors des écrans connus (le header n'affiche alors rien).
 */
export function pageTitleForPath(pathname: string): string | null {
  return (
    [...SUB_PAGE_TITLES, ...NAV_ITEMS].find((item) =>
      pathname.startsWith(item.href),
    )?.title ?? null
  );
}
