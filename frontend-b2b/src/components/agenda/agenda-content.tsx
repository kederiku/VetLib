/**
 * Écran Agenda : l'état de la page et l'orchestration des requêtes.
 *
 * L'état pilote (vue jour/semaine, date d'ancrage, filtre praticien)
 * vit dans l'URL (use-agenda-url-state) : F5 et liens partagés
 * conservent la période affichée. La période effective
 * (date_from/date_to) en est DÉRIVÉE à chaque rendu, et le composant
 * construit les COLONNES abstraites que le moteur de grille affiche :
 * 7 colonnes-jours en vue semaine, une colonne par praticien en vue
 * jour. Chaque combinaison période+filtre est une entrée de cache
 * TanStack distincte : keepPreviousData garde l'ancienne semaine
 * affichée pendant le chargement de la suivante.
 */
"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { UsersIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  AgendaGrid,
  DayColumnHeader,
  ResourceColumnHeader,
} from "@/components/agenda/agenda-grid";
import type {
  AgendaColumn,
  ClosedRange,
} from "@/components/agenda/agenda-grid-column";
import { AgendaToolbar } from "@/components/agenda/agenda-toolbar";
import { NewAppointmentDialog } from "@/components/agenda/new-appointment-dialog";
import {
  ALL_RESOURCES,
  useAgendaUrlState,
} from "@/components/agenda/use-agenda-url-state";
import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  useGetAgenda,
  useGetResourceWeeklySchedule,
  useListAppointmentTypes,
  useListResources,
} from "@/lib/api/generated/scheduling/scheduling";
import { resourceColorClasses } from "@/lib/agenda/colors";
import { computeWindow } from "@/lib/agenda/layout";
import { useHasPermission } from "@/lib/auth/permissions";
import {
  addDays,
  formatDateRangeLabel,
  formatDayLong,
  formatDayShort,
  getWeekStart,
  parisToday,
  toIsoDate,
  toParisDayKey,
  toParisDisplayDate,
} from "@/lib/date/format";

// "HH:MM:SS" (heure backend) -> minutes depuis minuit.
function backendTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function AgendaContent() {
  const { view, anchorDate, resourceId, setView, setAnchorDate, setResourceId } =
    useAgendaUrlState();
  const canManage = useHasPermission("clinic:manage");

  const [dialogOpen, setDialogOpen] = useState(false);
  // key du dialog : incrémentée à chaque ouverture pour REMONTER le
  // composant, donc repartir d'un formulaire vierge — et transporter les
  // valeurs préremplies du clic sur un créneau.
  const [dialogKey, setDialogKey] = useState(0);
  const [dialogInitialValues, setDialogInitialValues] = useState<
    { date?: Date; time?: string; resourceId?: string } | undefined
  >(undefined);

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
        // Navigation : une période déjà en cache s'affiche instantanément
        // (refetch en arrière-plan) ; une période inconnue passe par le
        // squelette (isPlaceholderData plus bas — les entrées de
        // l'ancienne période ne matcheraient aucun jour de la nouvelle).
        placeholderData: keepPreviousData,
      },
    },
  );

  // Praticiens et types ACTIFS : partagés entre la toolbar (filtre), les
  // colonnes de la vue jour et le dialog de création. Accessibles à tout
  // le staff depuis le correctif backend (GET en appointment:read).
  const resourcesQuery = useListResources({
    query: { select: (res) => res.data.filter((r) => r.active) },
  });
  const typesQuery = useListAppointmentTypes({
    query: { select: (res) => res.data.filter((t) => t.active) },
  });
  // useMemo : `?? []` recréerait un tableau neuf à chaque rendu et
  // invaliderait les useMemo qui en dépendent (colonnes).
  const resourcesData = resourcesQuery.data;
  const activeResources = useMemo(
    () => resourcesData ?? [],
    [resourcesData],
  );

  // Horaires d'ouverture, pour GRISER les heures fermées : uniquement en
  // contexte monopraticien (filtre actif, ou vue jour à praticien
  // unique) et pour un manager — le GET weekly-schedule reste réservé
  // clinic:manage, le enabled est la garde anti-403.
  const scheduleResourceId =
    resourceId !== ALL_RESOURCES
      ? resourceId
      : view === "day" && activeResources.length === 1
        ? activeResources[0].id
        : undefined;
  const scheduleQuery = useGetResourceWeeklySchedule(scheduleResourceId ?? "", {
    query: {
      enabled: canManage && scheduleResourceId !== undefined,
      // Test de statut : rétrécit l'union générée (variante 422 incluse)
      // — le mutator jette sur tout statut >= 400.
      select: (res) => (res.status === 200 ? res.data : []),
    },
  });

  const entries = useMemo(() => agendaQuery.data ?? [], [agendaQuery.data]);

  // Fenêtre horaire commune à toutes les colonnes de la période : la
  // grille ne "saute" pas d'un jour à l'autre de la même semaine.
  const window = useMemo(() => computeWindow(entries), [entries]);

  // Regroupement par jour CLINIQUE (jamais getDate() : règle fuseau).
  const entriesByDay = useMemo(() => {
    const map = new Map<string, typeof entries>();
    for (const entry of entries) {
      const dayKey = toParisDayKey(entry.starts_at);
      const dayEntries = map.get(dayKey) ?? [];
      dayEntries.push(entry);
      map.set(dayKey, dayEntries);
    }
    return map;
  }, [entries]);

  const todayKey = toIsoDate(parisToday());

  // Construction des colonnes abstraites du moteur de grille.
  const columns: AgendaColumn[] = useMemo(() => {
    if (view === "week") {
      // 7 colonnes-jours : lundi -> dimanche.
      return Array.from({ length: 7 }, (_, i) => {
        const day = addDays(rangeStart, i);
        const dayKey = toIsoDate(day);
        return {
          key: dayKey,
          header: (
            <DayColumnHeader
              label={formatDayShort(toParisDisplayDate(day))}
              isToday={dayKey === todayKey}
            />
          ),
          dayKey,
          date: day,
          // Filtre praticien actif : le clic sur un créneau vide peut
          // préremplir ce praticien (les entrées sont déjà filtrées).
          resourceId: resourceId !== ALL_RESOURCES ? resourceId : undefined,
          entries: entriesByDay.get(dayKey) ?? [],
        };
      });
    }

    // Vue jour : une colonne par praticien (ou une seule si filtre).
    const day = rangeStart;
    const dayKey = toIsoDate(day);
    const dayEntries = entriesByDay.get(dayKey) ?? [];
    const shownResources =
      resourceId !== ALL_RESOURCES
        ? activeResources.filter((r) => r.id === resourceId)
        : activeResources;

    return shownResources.map((resource) => ({
      key: resource.id,
      header: (
        <ResourceColumnHeader
          name={resource.name}
          dotClass={resourceColorClasses(resource.id).dot}
        />
      ),
      dayKey,
      date: day,
      resourceId: resource.id,
      entries: dayEntries.filter((entry) => entry.resource_id === resource.id),
    }));
  }, [view, rangeStart, resourceId, activeResources, entriesByDay, todayKey]);

  // Libellés lisibles des jours de chaque colonne (aria-label des
  // cellules : "Créer un rendez-vous lundi 24 août à 09:30").
  const dayLabels = useMemo(
    () => columns.map((column) => formatDayLong(toParisDisplayDate(column.date))),
    [columns],
  );

  // Heures FERMÉES par colonne = complément des plages d'ouverture du
  // praticien dans la fenêtre affichée (convention backend weekday :
  // 0 = lundi ... 6 = dimanche).
  const closedRangesByColumn = useMemo(() => {
    const schedule = scheduleQuery.data;
    if (schedule === undefined || scheduleResourceId === undefined) {
      return undefined;
    }
    const map = new Map<string, ClosedRange[]>();
    for (const column of columns) {
      if (column.resourceId !== scheduleResourceId) {
        continue;
      }
      const weekday = (column.date.getDay() + 6) % 7;
      const openRanges = schedule
        .filter((range) => range.weekday === weekday)
        .map((range) => ({
          startMin: backendTimeToMinutes(range.start_time),
          endMin: backendTimeToMinutes(range.end_time),
        }))
        .sort((a, b) => a.startMin - b.startMin);

      // Le voile ne doit jamais deborder de la fenetre affichee : une
      // plage d'ouverture qui commence apres window.endMin (praticien
      // de nuit) produirait sinon un rectangle plus haut que la
      // colonne, qui recouvrirait le bas de la grille.
      const closed: ClosedRange[] = [];
      let cursor = window.startMin;
      for (const range of openRanges) {
        const rangeStartMin = Math.min(range.startMin, window.endMin);
        if (rangeStartMin > cursor) {
          closed.push({ startMin: cursor, endMin: rangeStartMin });
        }
        cursor = Math.max(cursor, range.endMin);
      }
      if (cursor < window.endMin) {
        closed.push({ startMin: cursor, endMin: window.endMin });
      }
      map.set(column.key, closed);
    }
    return map;
  }, [scheduleQuery.data, scheduleResourceId, columns, window]);

  // Pas de la navigation : une semaine ou un jour selon la vue.
  const shiftDays = view === "week" ? 7 : 1;

  const openNewAppointment = (
    initialValues?: { date?: Date; time?: string; resourceId?: string },
  ) => {
    setDialogInitialValues(initialValues);
    setDialogKey((key) => key + 1);
    setDialogOpen(true);
  };

  // isPlaceholderData : pendant la navigation, data contient l'ANCIENNE
  // période — ses entrées ne matcheraient aucun jour de la nouvelle. En
  // vue jour sans filtre, les colonnes attendent aussi les praticiens.
  const isPending =
    agendaQuery.isPending ||
    agendaQuery.isPlaceholderData ||
    (view === "day" && resourcesQuery.isPending);

  return (
    <PageContainer>
      <PageHeader title="Agenda" />

      <AgendaToolbar
        view={view}
        onViewChange={setView}
        onPrevious={() => setAnchorDate(addDays(anchorDate, -shiftDays))}
        onNext={() => setAnchorDate(addDays(anchorDate, shiftDays))}
        onToday={() => setAnchorDate(parisToday())}
        rangeLabel={formatDateRangeLabel(
          // Réancrage à midi UTC : les bornes vivent dans le fuseau du
          // navigateur, le formatteur en Europe/Paris — sans cela le
          // libellé glisserait d'un jour pour un poste à l'est.
          toParisDisplayDate(rangeStart),
          toParisDisplayDate(rangeEnd),
        )}
        anchorDate={anchorDate}
        onAnchorSelect={setAnchorDate}
        resourceId={resourceId}
        onResourceChange={setResourceId}
        resources={activeResources}
        onNewAppointment={() => openNewAppointment()}
      />

      {/* Vue jour sans aucun praticien actif : la grille n'aurait aucune
          colonne — on explique quoi faire au lieu d'un écran vide. */}
      {view === "day" && !isPending && columns.length === 0 ? (
        <EmptyState
          icon={<UsersIcon />}
          title="Aucun praticien actif"
          description="La vue jour affiche une colonne par praticien. Ajoutez un praticien dans les réglages pour commencer."
          action={
            canManage ? (
              <Button
                nativeButton={false}
                render={<Link href="/reglages" />}
              >
                Ouvrir les réglages
              </Button>
            ) : undefined
          }
        />
      ) : (
        <AgendaGrid
          columns={columns}
          window={window}
          dayLabels={dayLabels}
          isPending={isPending}
          isError={agendaQuery.isError}
          onRetry={() => void agendaQuery.refetch()}
          onSlotClick={(slot) =>
            openNewAppointment({
              date: slot.date,
              time: slot.time,
              resourceId: slot.resourceId,
            })
          }
          closedRangesByColumn={closedRangesByColumn}
          periodKey={`${view}-${toIsoDate(rangeStart)}-${resourceId}`}
        />
      )}

      <NewAppointmentDialog
        key={dialogKey}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        resources={activeResources}
        appointmentTypes={typesQuery.data ?? []}
        initialValues={dialogInitialValues}
      />
    </PageContainer>
  );
}
