/**
 * Carte « Prochain rendez-vous » : le bloc principal du tableau de bord.
 *
 * C'est l'information que le propriétaire vient chercher en premier —
 * d'où sa taille, sa position et ses actions directes. Tout est dérivé
 * de la liste complète des rendez-vous (voir lib/appointments/derive.ts) :
 * aucune requête propre à cette carte.
 *
 * Le libellé du jour est RELATIF (« Demain à 09:00 ») parce que c'est
 * ainsi qu'on se projette ; la date complète reste affichée en dessous
 * pour lever toute ambiguïté.
 */
"use client";

import { CalendarDaysIcon, MapPinIcon, PawPrintIcon, StethoscopeIcon } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { nextAppointment } from "@/lib/appointments/derive";
import { STATUS_LABELS } from "@/lib/appointments/status";
import { useMyAppointments } from "@/lib/appointments/use-my-appointments";
import {
  formatDateLong,
  formatRelativeDay,
  formatTimeRange,
} from "@/lib/date/format";

export function NextAppointmentCard({ now }: { now: Date }) {
  const { data: appointments, isPending, isError, refetch } = useMyAppointments();

  const prochain = useMemo(
    () => (appointments === undefined ? null : nextAppointment(appointments, now)),
    [appointments, now],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prochain rendez-vous</CardTitle>
        <CardDescription>
          Toutes cliniques confondues.
        </CardDescription>
        {prochain !== null && (
          <CardAction>
            <Badge variant={STATUS_LABELS[prochain.status].badgeVariant}>
              {STATUS_LABELS[prochain.status].label}
            </Badge>
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Squelettes de MÊME silhouette que le contenu réel : une grosse
            ligne, puis quatre lignes de détail sur deux colonnes. Pas de
            saut de mise en page à l'arrivée des données. */}
        {isPending && (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-8 w-64" />
            <div className="grid gap-2 sm:grid-cols-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-40" />
            </div>
          </div>
        )}

        {isError && (
          <ErrorState
            title="Impossible de charger vos rendez-vous."
            onRetry={() => void refetch()}
          />
        )}

        {appointments !== undefined && prochain === null && (
          <EmptyState
            className=""
            icon={<CalendarDaysIcon aria-hidden />}
            title="Aucun rendez-vous à venir"
            description="Un vaccin, un contrôle ? Vos compagnons méritent bien une visite."
            action={
              <Button
                nativeButton={false}
                render={<Link href="/rendez-vous/nouveau" />}
              >
                Prendre rendez-vous
              </Button>
            }
          />
        )}

        {prochain !== null && (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-2xl font-bold tracking-tight tabular-nums">
                {formatRelativeDay(prochain.starts_at, now)} à{" "}
                {formatTimeRange(prochain.starts_at, prochain.ends_at)}
              </p>
              <p className="text-sm text-muted-foreground">
                {formatDateLong(prochain.starts_at)}
              </p>
            </div>

            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <span className="flex items-center gap-2">
                <StethoscopeIcon
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                {prochain.appointment_type_name}
              </span>
              <span className="flex items-center gap-2">
                <MapPinIcon
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                {prochain.clinic_name}
              </span>
              {/* pet_name nullable : rendez-vous créé par la clinique
                  sans fiche animal rattachée. */}
              {prochain.pet_name !== null && (
                <span className="flex items-center gap-2">
                  <PawPrintIcon
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  {prochain.pet_name}
                </span>
              )}
              <span className="flex items-center gap-2">
                <CalendarDaysIcon
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                {prochain.resource_name}
              </span>
            </div>
          </>
        )}
      </CardContent>

      {prochain !== null && (
        <CardFooter>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/rendez-vous/${prochain.id}`} />}
          >
            Voir le détail
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
