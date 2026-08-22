/**
 * Mutations des cliniques : hooks partagés par la liste et la fiche.
 *
 * Regroupés ici parce que l'invalidation de cache est la partie qu'on
 * oublie, et qu'elle est identique partout : après toute mutation, la LISTE
 * et la FICHE doivent être rafraîchies. Les laisser dans chaque dialogue
 * garantirait qu'un jour l'un des deux manque, et l'écran afficherait des
 * données périmées sans que rien ne le signale.
 *
 * Jamais de correction manuelle du cache (`setQueryData` avec un objet
 * reconstruit) : le backend est la source de vérité, et le staff_count
 * comme le statut peuvent changer autrement que par notre mutation.
 */
"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import {
  getGetAdminClinicQueryKey,
  getListAdminClinicsQueryKey,
} from "@/lib/api/generated/admin-clinics/admin-clinics";
import { getGetAdminStatsQueryKey } from "@/lib/api/generated/admin-stats/admin-stats";

/**
 * Invalide tout ce qu'une mutation de clinique rend périmé.
 *
 * La liste est invalidée par PRÉFIXE de clé : chaque combinaison de page, de
 * tri et de filtre est une entrée de cache distincte, et une mutation les
 * périme toutes. Le compteur du tableau de bord aussi — suspendre une
 * clinique fait bouger « actives » et « suspendues ».
 */
export function useInvaliderCliniques(): (clinicId?: string) => Promise<void> {
  const queryClient = useQueryClient();

  return useCallback(
    async (clinicId?: string) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListAdminClinicsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() }),
        ...(clinicId === undefined
          ? []
          : [
              queryClient.invalidateQueries({
                queryKey: getGetAdminClinicQueryKey(clinicId),
              }),
            ]),
      ]);
    },
    [queryClient],
  );
}
