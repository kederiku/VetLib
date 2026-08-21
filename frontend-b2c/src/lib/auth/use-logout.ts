/**
 * Déconnexion : la logique extraite en hook, partageable par tout
 * déclencheur d'UI (le menu du compte dans le header aujourd'hui, un
 * autre emplacement demain) sans dupliquer l'enchaînement délicat du
 * succès.
 *
 * POST /api/v1/owner/auth/logout : le backend invalide la session owner
 * et efface les cookies vetolib_owner_* (Set-Cookie d'expiration), sans
 * toucher à une éventuelle session staff du même navigateur. Côté
 * frontend, il reste deux choses à faire au succès : quitter la page
 * protégée et purger le cache — dans CET ordre, voir le onSuccess.
 */
"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { ApiError } from "@/lib/api/errors";
import { useOwnerLogout } from "@/lib/api/generated/owner-auth/owner-auth";

export function useLogoutAction(): { logout: () => void; isPending: boolean } {
  const router = useRouter();
  const queryClient = useQueryClient();

  const logoutMutation = useOwnerLogout<ApiError>({
    mutation: {
      onSuccess: () => {
        // ORDRE CRUCIAL : router.replace AVANT la purge du cache.
        // Si on purgeait d'abord, l'AuthGuard (toujours monté sur la
        // page courante) verrait la query /me repasser en "pending" et
        // relancerait un GET /me... avec des cookies déjà effacés :
        // 401, tentative de refresh silencieux inutile, et un flash de
        // squelette. En naviguant d'abord, l'arbre protégé se démonte,
        // plus personne n'observe la query au moment où on la retire.
        // replace (pas push) : "précédent" ne doit pas ramener sur une
        // page protégée après déconnexion.
        router.replace("/login");
        // clear() et PAS removeQueries sur la seule clé /me : le cache
        // contient AUSSI les animaux et les rendez-vous du propriétaire.
        // Sur un ordinateur familial partagé, se déconnecter puis
        // connecter un autre compte afficherait un instant les animaux
        // du précédent — servis depuis le cache, donc sans que le
        // backend soit seulement sollicité.
        // clear() et PAS invalidateQueries : invalider marquerait les
        // données périmées et déclencherait des refetch (401 garantis,
        // requêtes pour rien). On veut SUPPRIMER, purement et simplement.
        queryClient.clear();
      },
      onError: () => {
        // Échec (serveur injoignable...) : la session est TOUJOURS
        // ouverte (les cookies HttpOnly n'ont pas été effacés par le
        // serveur) — on le dit plutôt que d'échouer en silence, et on ne
        // redirige pas : prétendre être déconnecté serait un mensonge.
        // Toast (et non bandeau inline) : le déclencheur vit dans un
        // menu déroulant qui se ferme au clic, un bandeau n'aurait nulle
        // part où s'afficher.
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
