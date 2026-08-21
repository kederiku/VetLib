/**
 * Conteneur standard des pages du portail propriétaires.
 *
 * Avant lui, chaque écran choisissait sa largeur et son padding
 * (/mon-compte et /rendez-vous en max-w-2xl p-8, la coquille en
 * max-w-4xl) : l'oeil "sautait" à chaque navigation. Ce composant fixe
 * LE standard : padding p-6 partout, largeur max-w-4xl par défaut,
 * variante "narrow" max-w-2xl pour les écrans de lecture et de
 * formulaires.
 *
 * Pourquoi max-w-4xl et non le max-w-6xl du portail clinique : le B2B
 * affiche un agenda de clinique, dense et multi-colonnes. Ici les
 * listes sont celles d'UN particulier — trois animaux, quelques
 * rendez-vous. Étirer une carte de rendez-vous sur 1150 px la rendrait
 * moins lisible, pas plus riche.
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
        width === "default" ? "max-w-4xl" : "max-w-2xl",
        className,
      )}
    >
      {children}
    </div>
  );
}
