/**
 * Bouton de déconnexion.
 *
 * POST /api/v1/auth/logout : le backend invalide la session et efface
 * les cookies (Set-Cookie d'expiration). Côté frontend, il reste deux
 * choses à faire au succès : quitter la page protégée et purger le
 * cache de session — dans CET ordre, voir le commentaire du onSuccess.
 */
"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import type { ApiError } from "@/lib/api/errors";
import { getGetCurrentUserQueryKey, useLogout } from "@/lib/api/generated/auth/auth";

export function LogoutButton() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const logoutMutation = useLogout<ApiError>({
    mutation: {
      onSuccess: () => {
        // ORDRE CRUCIAL : router.replace AVANT removeQueries.
        // Si on purgeait le cache d'abord, l'AuthGuard (toujours monté
        // sur la page courante) verrait la query /me repasser en
        // "pending" et relancerait un GET /me... avec des cookies déjà
        // effacés : 401, tentative de refresh silencieux inutile, et un
        // flash de squelette. En naviguant d'abord, l'arbre protégé se
        // démonte, plus personne n'observe la query au moment où on la
        // retire. replace (pas push) : "précédent" ne doit pas ramener
        // sur une page protégée après déconnexion.
        router.replace("/login");
        // removeQueries et PAS invalidateQueries : invalider marquerait
        // la donnée périmée et déclencherait un refetch (401 garanti,
        // requêtes pour rien). On veut SUPPRIMER la session du cache,
        // purement et simplement.
        queryClient.removeQueries({ queryKey: getGetCurrentUserQueryKey() });
      },
    },
  });

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        variant="outline"
        onClick={() => logoutMutation.mutate()}
        disabled={logoutMutation.isPending}
      >
        {logoutMutation.isPending && <Spinner data-icon="inline-start" />}
        Se déconnecter
      </Button>
      {/* Échec (serveur injoignable...) : la session est TOUJOURS ouverte
          (les cookies HttpOnly n'ont pas été effacés par le serveur) — on
          l'affiche plutôt que d'échouer en silence, et on ne redirige pas :
          prétendre être déconnecté serait un mensonge. */}
      {logoutMutation.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            Déconnexion impossible : le serveur est injoignable. Vérifiez votre connexion et
            réessayez.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
