/**
 * Hook useCurrentUser : l'UNIQUE source de vérité sur la session.
 *
 * Pas de Context React ni de store global pour "l'utilisateur connecté" :
 * le cache TanStack Query joue déjà ce rôle. Tous les composants qui
 * appellent ce hook partagent la même entrée de cache (même queryKey
 * /api/v1/auth/me), donc la même donnée et le même état de chargement.
 * Se connecter = remplir cette entrée (setQueryData après le login),
 * se déconnecter = la supprimer (removeQueries après le logout).
 */
"use client";

import { useGetCurrentUser } from "@/lib/api/generated/auth/auth";

/**
 * Retourne la session courante sous forme de query TanStack :
 * - data : le UserResponse si connecté ;
 * - isPending : vérification en cours (au premier montage) ;
 * - isError : pas de session valide (401 même après refresh silencieux).
 */
export function useCurrentUser() {
  return useGetCurrentUser({
    query: {
      // retry: false : un 401 sur /me signifie "non connecté", pas une
      // panne passagère. Réessayer 3 fois (défaut TanStack) ferait
      // patienter l'utilisateur plusieurs secondes avant la redirection
      // vers /login. (Le refresh silencieux a DÉJÀ eu sa chance dans le
      // mutator avant que l'erreur n'arrive ici.)
      retry: false,
      // 5 min de fraîcheur : inutile de re-demander le profil à chaque
      // navigation ; il change rarement, et un vrai changement de droits
      // sera de toute façon appliqué côté backend à chaque requête.
      staleTime: 5 * 60_000,
      // Le mutator renvoie { status, data, headers } ; les composants ne
      // veulent que le UserResponse. select extrait .data UNE fois ici,
      // au lieu de forcer chaque appelant à écrire user?.data partout.
      select: (res) => res.data,
    },
  });
}
