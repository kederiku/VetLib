/**
 * Hook useCurrentAdmin : l'UNIQUE source de vérité sur la session admin.
 *
 * Pas de Context React ni de store global : le cache TanStack Query joue déjà
 * ce rôle. Tous les composants qui appellent ce hook partagent la même entrée
 * de cache (même queryKey /api/v1/admin/auth/me), donc la même donnée et le
 * même état de chargement. Se connecter = remplir cette entrée
 * (setQueryData après le login) ; se déconnecter = tout purger (clear()).
 */
"use client";

import { useGetCurrentAdmin } from "@/lib/api/generated/admin-auth/admin-auth";

/**
 * Session courante sous forme de query TanStack :
 * - data : l'AdminResponse si connecté ;
 * - isPending : vérification en cours ;
 * - isError : pas de session valide (401 même après refresh silencieux).
 *
 * `enabled` (défaut true) : quand false, la query ne lance aucune requête et
 * reste en isPending. Le GuestGuard s'en sert pour éviter les 401 de bruit
 * chez un visiteur sans indice de session (voir session-hint.ts).
 */
export function useCurrentAdmin(options?: { enabled?: boolean }) {
  return useGetCurrentAdmin({
    query: {
      enabled: options?.enabled ?? true,
      // Un 401 signifie « non connecté », pas une panne passagère : réessayer
      // trois fois (défaut TanStack) ferait patienter avant la redirection.
      // Le refresh silencieux a DÉJÀ eu sa chance dans le mutator.
      retry: false,
      // Le profil d'un administrateur ne change jamais en cours de séance.
      // Attention : ce staleTime ne repousse PAS la révocation d'un accès --
      // le backend relit le compte en base à chaque requête, c'est lui qui
      // ferme la porte, pas ce cache.
      staleTime: 5 * 60_000,
      // Le mutator renvoie { status, data, headers } ; les composants ne
      // veulent que l'AdminResponse. On extrait .data UNE fois, ici.
      select: (res) => res.data,
    },
  });
}
