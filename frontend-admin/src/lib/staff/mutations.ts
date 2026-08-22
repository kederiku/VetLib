/**
 * Mutations du personnel : hooks d'invalidation partagés.
 *
 * Même rôle que `lib/clinics/mutations.ts`, avec une subtilité en plus : un
 * membre du personnel apparaît dans DEUX listes — celle, transverse, de
 * l'écran Personnel, et celle, filtrée, de la fiche de sa clinique. Une
 * mutation périme les deux, plus l'effectif affiché sur la fiche clinique et
 * dans la liste des cliniques, plus les compteurs du tableau de bord.
 *
 * C'est exactement le genre d'oubli qui ne se voit pas en développement (on
 * recharge la page sans y penser) et qui, en production, affiche un effectif
 * faux pendant cinq minutes.
 */
"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import {
  getGetAdminClinicQueryKey,
  getListAdminClinicsQueryKey,
  getListAdminClinicStaffQueryKey,
} from "@/lib/api/generated/admin-clinics/admin-clinics";
import { getListAdminStaffQueryKey } from "@/lib/api/generated/admin-staff/admin-staff";
import { getGetAdminStatsQueryKey } from "@/lib/api/generated/admin-stats/admin-stats";

/**
 * Invalide tout ce qu'une mutation sur un compte du personnel rend périmé.
 *
 * @param clinicId Clinique du membre, quand on la connaît : la fiche et sa
 *                 sous-liste sont alors rafraîchies elles aussi.
 */
export function useInvaliderPersonnel(): (clinicId?: string) => Promise<void> {
  const queryClient = useQueryClient();

  return useCallback(
    async (clinicId?: string) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListAdminStaffQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListAdminClinicsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() }),
        ...(clinicId === undefined
          ? []
          : [
              queryClient.invalidateQueries({
                queryKey: getGetAdminClinicQueryKey(clinicId),
              }),
              queryClient.invalidateQueries({
                queryKey: getListAdminClinicStaffQueryKey(clinicId),
              }),
            ]),
      ]);
    },
    [queryClient],
  );
}
