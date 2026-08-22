/**
 * Déconnexion du back-office, extraite en hook pour être partageable par
 * n'importe quel déclencheur d'interface.
 *
 * POST /api/v1/admin/auth/logout : le backend expire les deux cookies. Côté
 * client il reste deux choses à faire, dans CET ordre précis (voir onSuccess).
 */
"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { ApiError } from "@/lib/api/errors";
import { useAdminLogout } from "@/lib/api/generated/admin-auth/admin-auth";
import { clearSessionHint } from "@/lib/auth/session-hint";

export function useLogoutAction(): { logout: () => void; isPending: boolean } {
  const router = useRouter();
  const queryClient = useQueryClient();

  const logoutMutation = useAdminLogout<ApiError>({
    mutation: {
      onSuccess: () => {
        // ORDRE CRUCIAL : router.replace AVANT la purge du cache. Si on
        // purgeait d'abord, l'AuthGuard encore monté verrait la query /me
        // repasser en « pending » et relancerait un GET /me avec des cookies
        // déjà effacés : 401, tentative de refresh inutile, et un flash de
        // squelette. En naviguant d'abord, l'arbre protégé se démonte et
        // plus personne n'observe la query au moment où on la retire.
        // replace (pas push) : « précédent » ne doit pas ramener sur un
        // écran protégé après déconnexion.
        router.replace("/login");
        clearSessionHint();
        // clear() et PAS removeQueries sur la seule clé /me : le cache de
        // cette application contient la liste de TOUTES les cliniques et de
        // TOUS les propriétaires de la plateforme. Le laisser derrière soi
        // sur un poste partagé serait le pire oubli possible.
        // clear() et PAS invalidateQueries : invalider marquerait les données
        // périmées et déclencherait des refetch — des 401 garantis, pour rien.
        queryClient.clear();
      },
      onError: () => {
        // Échec (serveur injoignable...) : la session est TOUJOURS ouverte,
        // les cookies HttpOnly n'ayant pas été effacés par le serveur. On ne
        // redirige pas : prétendre être déconnecté serait un mensonge, et
        // dans cet espace le mensonge coûterait cher. Toast et non bandeau :
        // le déclencheur est un menu qui se ferme au clic.
        toast.error(
          "Déconnexion impossible : le serveur est injoignable. Vérifiez votre connexion et réessayez.",
        );
      },
    },
  });

  return {
    logout: () => logoutMutation.mutate(),
    isPending: logoutMutation.isPending,
  };
}
