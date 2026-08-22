/**
 * Conteneur standard des pages protégées.
 *
 * Avant lui, chaque écran choisissait sa largeur et son padding
 * (agenda pleine largeur p-6, dashboard max-w-2xl p-8, réglages
 * max-w-3xl p-8) : l'oeil "sautait" à chaque navigation. Ce composant
 * fixe LE standard, et c'est le SEUL endroit de l'espace clinique où
 * une largeur de page se décide -- SidebarInset, au-dessus, est en
 * w-full flex-1 sans plafond.
 *
 * DEUX LARGEURS, pour deux natures d'écran :
 *
 * - 96rem (1536 px) pour les écrans DENSES : c'est la grille horaire de
 *   l'agenda qui en profite le plus, chaque praticien y gagnant une
 *   colonne plus lisible. Les 1152 px précédents laissaient encore
 *   250 px de vide de chaque côté sur un écran de 1920. Le plafond
 *   demeure : en ultra-large, une journée d'agenda étirée sans limite
 *   deviendrait illisible dans l'autre sens.
 *
 * - 48rem (768 px) pour les FORMULAIRES (réglages), inchangé : au-delà
 *   d'environ 800 px, l'oeil perd la ligne entre le libellé à gauche et
 *   la fin du champ à droite.
 *
 * Les deux portails partagent désormais la même largeur dense : le
 * raisonnement initial (« les listes d'un particulier sont plus
 * courtes ») confondait la longueur des listes avec la largeur de la
 * fenêtre.
 */
import { cn } from "@/lib/utils";

export function PageContainer({
  width = "default",
  className,
  children,
}: {
  width?: "default" | "narrow";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-6 p-6",
        width === "default" ? "max-w-[96rem]" : "max-w-3xl",
        className,
      )}
    >
      {children}
    </div>
  );
}
