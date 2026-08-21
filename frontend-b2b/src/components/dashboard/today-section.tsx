/**
 * Section "Aujourd'hui" : la liste chronologique des rendez-vous du
 * jour — l'écran qu'un poste d'accueil garde ouvert.
 *
 * Réutilise AppointmentRow (heure, type, badge de statut, client,
 * animal, praticien, menu d'actions) : le tableau de bord et l'agenda
 * affichent un rendez-vous EXACTEMENT de la même façon, et les actions
 * du menu (confirmer, terminer, annuler) fonctionnent d'ici aussi.
 */
"use client";

import { CalendarPlusIcon } from "lucide-react";
import Link from "next/link";

import { AppointmentRow } from "@/components/agenda/appointment-row";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardAgenda } from "@/lib/scheduling/use-dashboard-agenda";

export function TodaySection() {
  const { isPending, isError, refetch, todayEntries } = useDashboardAgenda();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aujourd&apos;hui</CardTitle>
        <CardDescription>
          {todayEntries !== undefined
            ? // "rendez-vous" est invariable : pas de pluriel à gérer.
              `${todayEntries.length} rendez-vous au planning.`
            : "Les rendez-vous du jour, dans l'ordre de la journée."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isPending && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
          </div>
        )}

        {isError && (
          <ErrorState
            title="Impossible de charger la journée."
            onRetry={refetch}
          />
        )}

        {todayEntries !== undefined && todayEntries.length === 0 && (
          <EmptyState
            icon={<CalendarPlusIcon />}
            title="Aucun rendez-vous aujourd'hui"
            description="La journée est libre. Les nouveaux rendez-vous apparaîtront ici."
            action={
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/agenda" />}
              >
                Ouvrir l&apos;agenda
              </Button>
            }
          />
        )}

        {todayEntries !== undefined &&
          todayEntries.map((entry) => (
            <AppointmentRow key={entry.id} entry={entry} />
          ))}
      </CardContent>
    </Card>
  );
}
