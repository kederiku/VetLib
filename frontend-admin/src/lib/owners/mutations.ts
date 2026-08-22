/**
 * Mutations des propriétaires : invalidation partagée.
 *
 * Même principe que pour les cliniques et le personnel : la liste (toutes
 * ses pages, invalidées par préfixe de clé), la fiche, et les compteurs du
 * tableau de bord — désactiver un compte fait bouger « actifs » et
 * « désactivés ».
 */
"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import {
  getGetAdminOwnerQueryKey,
  getListAdminOwnersQueryKey,
} from "@/lib/api/generated/admin-owners/admin-owners";
import { getGetAdminStatsQueryKey } from "@/lib/api/generated/admin-stats/admin-stats";

export function useInvaliderProprietaires(): (ownerId?: string) => Promise<void> {
  const queryClient = useQueryClient();

  return useCallback(
    async (ownerId?: string) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListAdminOwnersQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() }),
        ...(ownerId === undefined
          ? []
          : [
              queryClient.invalidateQueries({
                queryKey: getGetAdminOwnerQueryKey(ownerId),
              }),
            ]),
      ]);
    },
    [queryClient],
  );
}
