/**
 * Déconnexion : la logique extraite en hook, partageable par tout
 * déclencheur d'UI (menu utilisateur du header aujourd'hui, autre
 * emplacement demain) sans dupliquer l'enchaînement délicat du succès.
 *
 * POST /api/v1/auth/logout : le backend invalide la session et efface
 * les cookies (Set-Cookie d'expiration). Côté frontend, il reste deux
 * choses à faire au succès : quitter la page protégée et purger le
 * cache de session — dans CET ordre, voir le commentaire du onSuccess.
 */
"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { ApiError } from "@/lib/api/errors";
import { useLogout } from "@/lib/api/generated/auth/auth";
import { clearSessionHint } from "@/lib/auth/session-hint";

export function useLogoutAction(): { logout: () => void; isPending: boolean } {
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
        // Retrait de l'indice de session localStorage : les cookies
        // viennent d'être effacés par le serveur, le GuestGuard de
        // /login ne doit plus lancer de vérification /me pour rien.
        // L'ordre par rapport à router.replace est sans importance :
        // le hint n'est lu qu'au MONTAGE du GuestGuard, qui n'a pas
        // encore eu lieu à cet instant.
        clearSessionHint();
        // clear() et PAS removeQueries sur la seule clé /me : le cache
        // contient AUSSI les données métier du tenant qu'on quitte
        // (agenda, praticiens, types, fiche clinique). Sans purge
        // complète, connecter un autre compte sur le même poste
        // afficherait un instant les rendez-vous de la clinique
        // précédente — servis depuis le cache, donc sans que le
        // backend (RLS, cookies) soit seulement sollicité.
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
        // menu déroulant qui se ferme au clic, un bandeau n'aurait
        // nulle part où s'afficher.
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
