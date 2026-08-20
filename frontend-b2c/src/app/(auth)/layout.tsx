/**
 * Layout du groupe de routes (auth) : /login et /register.
 *
 * Les parenthèses dans le nom du dossier créent un "route group" Next.js :
 * le segment n'apparaît PAS dans l'URL (on a bien /login, pas /auth/login),
 * mais les pages du groupe partagent ce layout. Ici : un écran centré,
 * min-h-svh (hauteur de la fenêtre visible, fiable sur mobile) et une
 * colonne max-w-md, la largeur classique d'un formulaire d'auth.
 * Server Component : aucune interactivité, juste de la mise en page.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
