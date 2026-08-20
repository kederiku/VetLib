/**
 * Écran Agenda : l'état de la page et l'orchestration des requêtes.
 *
 * Trois morceaux d'état pilotent TOUT l'écran : la vue (jour/semaine),
 * la date d'ancrage (un jour quelconque de la période affichée) et le
 * filtre praticien. La période effective (date_from/date_to) en est
 * DÉRIVÉE à chaque rendu — pas de duplication d'état à maintenir.
 * Chaque combinaison période+filtre est une entrée de cache TanStack
 * distincte : keepPreviousData garde l'ancienne semaine affichée pendant
 * le chargement de la suivante (pas d'écran blanc en naviguant).
 */
"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";

import { AgendaList } from "@/components/agenda/agenda-list";
import {
  ALL_RESOURCES,
  AgendaToolbar,
  type AgendaView,
} from "@/components/agenda/agenda-toolbar";
import { NewAppointmentDialog } from "@/components/agenda/new-appointment-dialog";
import {
  useGetAgenda,
  useListAppointmentTypes,
  useListResources,
} from "@/lib/api/generated/scheduling/scheduling";
import {
  addDays,
  formatDateRangeLabel,
  getWeekStart,
  toIsoDate,
} from "@/lib/date/format";

export function AgendaContent() {
  const [view, setView] = useState<AgendaView>("week");
  // useState(() => new Date()) : la date d'ancrage est figée au montage
  // (l'initialiseur fonction n'est évalué qu'une fois), puis ne change
  // que par les boutons de navigation.
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [resourceId, setResourceId] = useState<string>(ALL_RESOURCES);

  const [dialogOpen, setDialogOpen] = useState(false);
  // key du dialog : incrémentée à chaque ouverture pour REMONTER le
  // composant, donc repartir d'un formulaire vierge (pas de reset manuel).
  const [dialogKey, setDialogKey] = useState(0);

  // Période dérivée : semaine de lundi à dimanche autour de l'ancre, ou
  // le seul jour d'ancrage en vue jour.
  const rangeStart = view === "week" ? getWeekStart(anchorDate) : anchorDate;
  const dayCount = view === "week" ? 7 : 1;
  const rangeEnd = addDays(rangeStart, dayCount - 1);

  const agendaQuery = useGetAgenda(
    {
      date_from: toIsoDate(rangeStart),
      date_to: toIsoDate(rangeEnd),
      // OMETTRE resource_id quand "tous" : le backend attend un UUID ou
      // rien, jamais une chaîne vide (422 sinon).
      ...(resourceId !== ALL_RESOURCES && { resource_id: resourceId }),
    },
    {
      query: {
        // Test de statut : uniquement pour rétrécir le type TypeScript
        // (l'union générée inclut la variante 422) — le mutator jette
        // sur tout statut >= 400, on est forcément en 200 ici.
        select: (res) => (res.status === 200 ? res.data : []),
        // Navigation fluide : la période précédente reste affichée (un
        // peu périmée) pendant le fetch de la nouvelle, au lieu de
        // repasser par les squelettes à chaque clic.
        placeholderData: keepPreviousData,
      },
    },
  );

  // Praticiens et types ACTIFS : partagés entre la toolbar (filtre) et
  // le dialog de création (Selects). Les inactifs ne prennent plus de
  // nouveaux rendez-vous.
  const resourcesQuery = useListResources({
    query: { select: (res) => res.data.filter((r) => r.active) },
  });
  const typesQuery = useListAppointmentTypes({
    query: { select: (res) => res.data.filter((t) => t.active) },
  });

  // Pas de la navigation : une semaine ou un jour selon la vue.
  const shiftDays = view === "week" ? 7 : 1;

  const openNewAppointment = () => {
    setDialogKey((key) => key + 1);
    setDialogOpen(true);
  };

  return (
    <div className="flex w-full flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold tracking-tight">Agenda</h1>

      <AgendaToolbar
        view={view}
        onViewChange={setView}
        onPrevious={() => setAnchorDate((date) => addDays(date, -shiftDays))}
        onNext={() => setAnchorDate((date) => addDays(date, shiftDays))}
        onToday={() => setAnchorDate(new Date())}
        rangeLabel={formatDateRangeLabel(rangeStart, rangeEnd)}
        resourceId={resourceId}
        onResourceChange={setResourceId}
        resources={resourcesQuery.data ?? []}
        onNewAppointment={openNewAppointment}
      />

      <AgendaList
        entries={agendaQuery.data}
        rangeStart={rangeStart}
        dayCount={dayCount}
        isPending={agendaQuery.isPending}
        isError={agendaQuery.isError}
        onRetry={() => void agendaQuery.refetch()}
        onNewAppointment={openNewAppointment}
      />

      <NewAppointmentDialog
        key={dialogKey}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        resources={resourcesQuery.data ?? []}
        appointmentTypes={typesQuery.data ?? []}
      />
    </div>
  );
}
