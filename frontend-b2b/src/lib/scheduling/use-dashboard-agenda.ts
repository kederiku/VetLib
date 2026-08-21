/**
 * Données du tableau de bord : UNE query agenda, plusieurs dérivations.
 *
 * Le tableau de bord n'a pas d'endpoint dédié : tout se DÉRIVE de
 * l'agenda (lundi de la semaine courante -> J+7), côté client. Une seule
 * requête alimente la journée en cours, les rendez-vous à confirmer et
 * la répartition par praticien — et comme sa queryKey partage le préfixe
 * de l'agenda, invalidateAgenda la rafraîchit après CHAQUE action, y
 * compris celles faites depuis le tableau de bord lui-même.
 *
 * refetchInterval 60 s : l'écran type "poste d'accueil" reste vivant
 * (un rendez-vous pris depuis le portail B2C apparaît sans F5).
 */
"use client";

import { useMemo } from "react";

import { useGetAgenda } from "@/lib/api/generated/scheduling/scheduling";
import type { AgendaEntryResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import {
  addDays,
  getWeekStart,
  parisToday,
  toIsoDate,
  toParisDayKey,
} from "@/lib/date/format";

export type ResourceLoad = {
  resourceId: string;
  resourceName: string;
  count: number;
};

export function useDashboardAgenda(): {
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
  /** Rendez-vous du jour (hors annulés), tri chronologique. */
  todayEntries: AgendaEntryResponse[] | undefined;
  /** Rendez-vous "pending" d'aujourd'hui à J+7, tri chronologique. */
  pendingNext7: AgendaEntryResponse[] | undefined;
  /** Nombre de rendez-vous du jour par praticien, du plus chargé au moins. */
  byResourceToday: ResourceLoad[] | undefined;
} {
  // Bornes stables à l'échelle d'une journée (précision jour de
  // toIsoDate) : la queryKey ne change pas entre deux rendus.
  const today = parisToday();

  const agendaQuery = useGetAgenda(
    {
      date_from: toIsoDate(getWeekStart(today)),
      date_to: toIsoDate(addDays(today, 7)),
    },
    {
      query: {
        // res.status === 200 : rétrécissement TypeScript uniquement
        // (l'union générée inclut la variante 422 ; le mutator jette sur
        // tout statut >= 400, on est forcément en 200 ici).
        select: (res) => (res.status === 200 ? res.data : []),
        refetchInterval: 60_000,
      },
    },
  );

  const entries = agendaQuery.data;

  const derived = useMemo(() => {
    if (entries === undefined) {
      return {
        todayEntries: undefined,
        pendingNext7: undefined,
        byResourceToday: undefined,
      };
    }

    const todayKey = toIsoDate(parisToday());
    const byStart = (a: AgendaEntryResponse, b: AgendaEntryResponse) =>
      a.starts_at.localeCompare(b.starts_at);

    // Jour CLINIQUE via toParisDayKey, jamais getDate() (règle fuseau).
    const todayEntries = entries
      .filter(
        (entry) =>
          toParisDayKey(entry.starts_at) === todayKey &&
          entry.status !== "cancelled",
      )
      .sort(byStart);

    // Les "pending" passés (début de semaine) ne sont plus actionnables
    // utilement ici : on ne signale que d'aujourd'hui à J+7, comme
    // l'ancienne carte.
    const pendingNext7 = entries
      .filter(
        (entry) =>
          entry.status === "pending" &&
          toParisDayKey(entry.starts_at) >= todayKey,
      )
      .sort(byStart);

    const loadByResource = new Map<string, ResourceLoad>();
    for (const entry of todayEntries) {
      const load = loadByResource.get(entry.resource_id) ?? {
        resourceId: entry.resource_id,
        resourceName: entry.resource_name,
        count: 0,
      };
      load.count += 1;
      loadByResource.set(entry.resource_id, load);
    }
    const byResourceToday = [...loadByResource.values()].sort(
      (a, b) => b.count - a.count,
    );

    return { todayEntries, pendingNext7, byResourceToday };
  }, [entries]);

  return {
    isPending: agendaQuery.isPending,
    isError: agendaQuery.isError,
    refetch: () => void agendaQuery.refetch(),
    ...derived,
  };
}
