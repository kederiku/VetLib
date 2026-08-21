/**
 * Conteneur standard des pages protégées.
 *
 * Avant lui, chaque écran choisissait sa largeur et son padding
 * (agenda pleine largeur p-6, dashboard max-w-2xl p-8, réglages
 * max-w-3xl p-8) : l'oeil "sautait" à chaque navigation. Ce composant
 * fixe LE standard : padding p-6 partout, largeur max-w-6xl par défaut
 * (écrans denses : agenda, tableau de bord), variante "narrow" max-w-3xl
 * pour les écrans de formulaires (réglages) où une colonne étroite
 * reste plus lisible.
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
        width === "default" ? "max-w-6xl" : "max-w-3xl",
        className,
      )}
    >
      {children}
    </div>
  );
}
