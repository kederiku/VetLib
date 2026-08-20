/**
 * Carte "À confirmer" du tableau de bord.
 *
 * Interroge le MÊME endpoint agenda que la page /agenda (aujourd'hui à
 * J+7) et filtre les rendez-vous pending via select : le filtrage vit
 * dans la query, les composants ne voient que la donnée utile. Partager
 * l'endpoint a un bonus : invalidateAgenda (invalidation par préfixe)
 * rafraîchit AUSSI cette carte après chaque action sur un rendez-vous.
 */
"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatClientName } from "@/components/agenda/appointment-row";
import { useGetAgenda } from "@/lib/api/generated/scheduling/scheduling";
import { addDays, formatDayLong, formatTime, toIsoDate } from "@/lib/date/format";

// Aperçu volontairement court : le tableau de bord signale, l'agenda
// traite. Au-delà, le lien "Voir l'agenda" prend le relais.
const PREVIEW_COUNT = 5;

export function PendingAppointmentsCard() {
  // Bornes du jour courant à J+7. Recalculées à chaque rendu, mais
  // stables à l'échelle d'une journée (précision jour de toIsoDate) :
  // la queryKey ne change donc pas entre deux rendus.
  const today = new Date();

  const pendingQuery = useGetAgenda(
    { date_from: toIsoDate(today), date_to: toIsoDate(addDays(today, 7)) },
    {
      query: {
        // res.status === 200 : rétrécissement TypeScript uniquement
        // (l'union générée inclut la variante 422 ; le mutator jette sur
        // tout statut >= 400, on est forcément en 200 ici).
        select: (res) =>
          res.status === 200
            ? res.data.filter((entry) => entry.status === "pending")
            : [],
      },
    },
  );
  const pending = pendingQuery.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>À confirmer</CardTitle>
        <CardDescription>
          Rendez-vous en attente sur les 7 prochains jours.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {pendingQuery.isPending && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        )}

        {pendingQuery.isError && (
          <p className="text-sm text-muted-foreground">
            Impossible de charger les rendez-vous en attente.
          </p>
        )}

        {pending !== undefined && pending.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aucun rendez-vous en attente.
          </p>
        )}

        {pending !== undefined && pending.length > 0 && (
          <>
            {/* "rendez-vous" est invariable : pas de pluriel à gérer. */}
            <p className="text-sm font-medium">
              {pending.length} rendez-vous à confirmer
            </p>
            <ul className="flex flex-col gap-1.5">
              {pending.slice(0, PREVIEW_COUNT).map((entry) => (
                <li key={entry.id} className="text-sm text-muted-foreground">
                  <span className="first-letter:uppercase">
                    {formatDayLong(entry.starts_at)}
                  </span>{" "}
                  à {formatTime(entry.starts_at)} — {formatClientName(entry)}
                </li>
              ))}
            </ul>
          </>
        )}

        <div>
          {/* Base UI n'a pas asChild : render={<Link/>} substitue le
              lien Next.js au bouton en conservant style et clavier. */}
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href="/agenda" />}
          >
            Voir l&apos;agenda
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
