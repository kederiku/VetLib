/**
 * Layout du groupe de routes (auth) : /login, et rien d'autre.
 *
 * Les parenthèses créent un « route group » Next.js : le segment n'apparaît
 * pas dans l'URL. Écran centré, largeur de formulaire classique, fond
 * légèrement teinté pour détacher la carte.
 *
 * Différence avec les deux portails : le bloc de marque n'est PAS cliquable.
 * Là-bas il ramène à la landing ; ici "/" redirige vers le tableau de bord,
 * qui renverrait aussitôt sur /login — un lien qui tourne en rond.
 */
import { ShieldCheckIcon } from "lucide-react";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand text-brand-foreground">
          {/* aria-hidden : icône décorative, le texte porte le sens. */}
          <ShieldCheckIcon className="size-5" aria-hidden />
        </span>
        <span className="font-semibold">VetoLib Admin</span>
      </div>
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
