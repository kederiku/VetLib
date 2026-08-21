/**
 * Layout du groupe de routes (auth) : /login et /register.
 *
 * Les parenthèses dans le nom du dossier créent un "route group" Next.js :
 * le segment n'apparaît PAS dans l'URL (on a bien /login, pas /auth/login),
 * mais les pages du groupe partagent ce layout. Ici : un écran centré,
 * min-h-svh (hauteur de la fenêtre visible, fiable sur mobile), un bloc
 * de marque cliquable vers l'accueil, et une colonne max-w-md, la largeur
 * classique d'un formulaire d'auth. Le fond bg-muted/40 détache les cards
 * des formulaires (blanches) de la page.
 * Server Component : aucune interactivité, juste de la mise en page.
 */
import { Stethoscope } from "lucide-react";
import Link from "next/link";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-4">
      {/* Bloc de marque : rappelle où l'on est et offre une sortie vers
          la landing ("/") sans bouton Précédent. */}
      <Link href="/" className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand text-brand-foreground">
          {/* aria-hidden : icône décorative, le texte porte le sens. */}
          <Stethoscope className="size-5" aria-hidden />
        </span>
        <span className="font-semibold">VetoLib Pro</span>
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
