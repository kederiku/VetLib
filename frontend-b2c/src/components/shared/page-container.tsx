/**
 * Conteneur standard des pages du portail propriétaires.
 *
 * Avant lui, chaque écran choisissait sa largeur et son padding
 * (/mon-compte et /rendez-vous en max-w-2xl p-8, la coquille en
 * max-w-4xl) : l'oeil "sautait" à chaque navigation. Ce composant fixe
 * LE standard, et c'est le SEUL endroit du portail où une largeur de
 * page se décide -- SidebarInset, au-dessus, est en w-full flex-1 sans
 * plafond.
 *
 * DEUX LARGEURS, pour deux natures d'écran :
 *
 * - 96rem (1536 px) pour les écrans DENSES (tableau de bord, listes,
 *   grille d'animaux). Sur un écran de 1920, les 896 px précédents
 *   laissaient près de 500 px de vide de chaque côté ; il en reste
 *   maintenant environ 160. Le plafond demeure : sans lui, une ligne de
 *   rendez-vous s'étirerait sur 2500 px en ultra-large, et le vide se
 *   déplacerait simplement à l'intérieur du contenu.
 *
 * - 48rem (768 px) pour la LECTURE et les FORMULAIRES (mon compte,
 *   fiche d'un rendez-vous, tunnel). C'est une limite typographique
 *   assumée et non une timidité : au-delà d'environ 800 px, l'oeil perd
 *   la ligne entre le libellé à gauche et la fin du champ à droite.
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
