/**
 * AuthGuard : garde des pages réservées aux utilisateurs connectés.
 *
 * Enveloppe les pages du groupe (protected). Trois états possibles de la
 * query /me : vérification en cours -> squelette de chargement ; échec
 * (401 même après le refresh silencieux du mutator) -> redirection vers
 * /login ; succès -> rendu des enfants. La protection RÉELLE des données
 * reste côté backend (cookies + RLS) : ce composant n'est qu'une
 * commodité d'expérience utilisateur, pas une barrière de sécurité.
 */
"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { clearSessionHint } from "@/lib/auth/session-hint";
import { useCurrentUser } from "@/lib/auth/use-current-user";

/**
 * Squelette plein écran affiché pendant la vérification de session.
 * C'est une SILHOUETTE de l'AppShell (sidebar + header + contenu) : la
 * page vérifiée apparaît "en place" au lieu d'un flash entre deux mises
 * en page sans rapport. Rendu IDENTIQUE côté serveur et côté client :
 * pas de branchement sur `window` ou autre API navigateur, sinon le HTML
 * du SSR différerait de celui de l'hydratation React (erreur "hydration
 * mismatch").
 */
function FullPageSkeleton() {
  return (
    <div className="flex min-h-svh">
      {/* Silhouette de la sidebar : masquée sous md, comme la vraie
          (sur mobile elle vit dans un panneau off-canvas). */}
      <div className="flex w-64 shrink-0 flex-col gap-6 border-r p-4 max-md:hidden">
        {/* Bloc de marque */}
        <Skeleton className="h-8 w-36" />
        {/* Entrées de navigation simulées */}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
      {/* Zone principale : header + contenu. min-w-0 pour que la colonne
          flex puisse rétrécir sous la largeur de son contenu. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center border-b px-4">
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="flex flex-col gap-6 p-6">
          {/* Titre de page simulé */}
          <Skeleton className="h-8 w-64" />
          {/* Deux blocs de contenu simulés */}
          <Skeleton className="h-48 w-full max-w-3xl" />
          <Skeleton className="h-24 w-full max-w-3xl" />
        </div>
      </div>
    </div>
  );
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  // Query TOUJOURS activée ici (contrairement au GuestGuard) : sur une
  // page protégée, vérifier la session n'est jamais du bruit.
  const { isPending, isError } = useCurrentUser();

  // La redirection est un EFFET, jamais un appel pendant le rendu :
  // React interdit de modifier le routeur (état externe) au milieu d'un
  // rendu. replace (et non push) : la page protégée ne doit pas rester
  // dans l'historique, sinon "précédent" ramènerait sur un écran vide.
  useEffect(() => {
    if (isError) {
      // Resynchronisation de l'indice de session : la session vient
      // d'être constatée invalide (cookies expirés/effacés), le drapeau
      // localStorage ne doit plus prétendre le contraire — sinon le
      // GuestGuard de /login relancerait des vérifications pour rien.
      clearSessionHint();
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
