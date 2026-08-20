/**
 * UpcomingAppointments : l'apercu "Prochains rendez-vous" de /account.
 *
 * Reutilise la MEME query que la page /rendez-vous (meme queryKey
 * TanStack) : si la liste complete a deja ete visitee, l'apercu s'affiche
 * depuis le cache sans requete, et toute invalidation (annulation,
 * nouvelle demande) rafraichit les deux ecrans d'un coup.
 *
 * Filtre : les trois prochains rendez-vous a venir (starts_at futur, tri
 * ascendant), lignes compactes. Etat vide : phrase engageante + CTA vers
 * le wizard.
 */
"use client";

import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useListMyAppointments } from "@/lib/api/generated/owner-appointments/owner-appointments";
import { STATUS_LABELS } from "@/lib/appointments/status";
import { formatDateShort, formatTime } from "@/lib/date/format";

// Nombre de lignes de l'apercu : assez pour se projeter, sans envahir la
// page de compte (la liste complete est a un clic).
const PREVIEW_COUNT = 3;

export function UpcomingAppointments() {
  const {
    data: appointments,
    isPending,
    isError,
  } = useListMyAppointments({ query: { select: (res) => res.data } });

  // "Maintenant" fige au premier rendu (meme approche que la page
  // /rendez-vous) : la frontiere futur/passe ne bouge pas d'un rendu a
  // l'autre tant que le composant reste monte.
  const now = useMemo(() => new Date(), []);

  // Les prochains rendez-vous : futurs, tri chronologique, 3 premiers.
  const upcoming = useMemo(() => {
    const nowMs = now.getTime();
    return (appointments ?? [])
      .filter((appt) => new Date(appt.starts_at).getTime() > nowMs)
      .sort(
        (a, b) =>
          new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
      )
      .slice(0, PREVIEW_COUNT);
  }, [appointments, now]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prochains rendez-vous</CardTitle>
        <CardDescription>
          Vos visites vétérinaires à venir, toutes cliniques confondues.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isPending && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}

        {/* Echec discret : l'apercu n'est pas critique sur cette page,
            un message textuel suffit (pas d'Alert anxiogene). */}
        {isError && (
          <p className="text-sm text-muted-foreground">
            Impossible de charger vos rendez-vous pour le moment.
          </p>
        )}

        {appointments !== undefined && upcoming.length === 0 && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">
              Aucun rendez-vous à venir. Un vaccin, un contrôle ? Vos
              compagnons méritent bien une visite.
            </p>
            <Button
              nativeButton={false}
              render={<Link href="/rendez-vous/nouveau" />}
            >
              <Plus data-icon="inline-start" aria-hidden />
              Prendre rendez-vous
            </Button>
          </div>
        )}

        {upcoming.length > 0 && (
          <>
            <ul className="flex flex-col divide-y">
              {upcoming.map((appt) => {
                const status = STATUS_LABELS[appt.status];
                return (
                  <li
                    key={appt.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm first:pt-0 last:pb-0"
                  >
                    <span className="font-medium">
                      {formatDateShort(appt.starts_at)}
                    </span>
                    <span className="text-muted-foreground">
                      {formatTime(appt.starts_at)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {appt.clinic_name}
                      {appt.pet_name !== null && (
                        <span className="text-muted-foreground">
                          {" "}
                          — {appt.pet_name}
                        </span>
                      )}
                    </span>
                    <Badge variant={status.badgeVariant}>{status.label}</Badge>
                  </li>
                );
              })}
            </ul>
            <div>
              <Button
                variant="link"
                size="sm"
                className="px-0"
                nativeButton={false}
                render={<Link href="/rendez-vous" />}
              >
                Tous mes rendez-vous
                <ArrowRight data-icon="inline-end" aria-hidden />
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
