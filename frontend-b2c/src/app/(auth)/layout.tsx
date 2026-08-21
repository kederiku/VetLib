/**
 * Layout du groupe de routes (auth) : /login et /register.
 *
 * Les parenthèses dans le nom du dossier créent un "route group" Next.js :
 * le segment n'apparaît PAS dans l'URL (on a bien /login, pas /auth/login),
 * mais les pages du groupe partagent ce layout. Ici : un écran centré,
 * min-h-svh (hauteur de la fenêtre visible, fiable sur mobile).
 * Server Component : aucune interactivité, juste de la mise en page.
 *
 * La LARGEUR est laissée à chaque page, et non imposée ici : /login se
 * contente d'une colonne étroite (max-w-md, la largeur classique d'un
 * formulaire d'auth) quand le parcours d'inscription a besoin de plus
 * (bloc adresse, liste d'animaux).
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="w-full">{children}</div>
    </main>
  );
}
