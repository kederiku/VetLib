/**
 * AuthGuard : garde des pages réservées aux propriétaires connectés.
 *
 * Enveloppe les pages du groupe (protected). Trois états possibles de la
 * query /me : vérification en cours -> squelette de chargement ; échec
 * (401 même après le refresh silencieux du mutator) -> redirection vers
 * /login ; succès -> rendu des enfants. La protection RÉELLE des données
 * reste côté backend (cookies) : ce composant n'est qu'une commodité
 * d'expérience utilisateur, pas une barrière de sécurité.
 */
"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/lib/auth/use-current-user";

/**
 * Squelette plein écran affiché pendant la vérification de session.
 * Rendu IDENTIQUE côté serveur et côté client : pas de branchement sur
 * `window` ou autre API navigateur, sinon le HTML du SSR différerait de
 * celui de l'hydratation React (erreur "hydration mismatch").
 */
function FullPageSkeleton() {
  return (
    <div className="flex min-h-svh flex-col gap-6 p-8">
      {/* Barre de titre simulée */}
      <Skeleton className="h-10 w-64" />
      {/* Bloc de contenu principal simulé */}
      <Skeleton className="h-48 w-full max-w-2xl" />
      <Skeleton className="h-24 w-full max-w-2xl" />
    </div>
  );
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isPending, isError } = useCurrentUser();

  // La redirection est un EFFET, jamais un appel pendant le rendu :
  // React interdit de modifier le routeur (état externe) au milieu d'un
  // rendu. replace (et non push) : la page protégée ne doit pas rester
  // dans l'historique, sinon "précédent" ramènerait sur un écran vide.
  useEffect(() => {
    if (isError) {
      router.replace("/login");
    }
  }, [isError, router]);

  // Vérification en cours OU redirection imminente : on montre le
  // squelette. Ne JAMAIS rendre children quand isError : le composant
  // protégé lirait un user undefined et planterait.
  if (isPending || isError) {
    return <FullPageSkeleton />;
  }

  return <>{children}</>;
}
