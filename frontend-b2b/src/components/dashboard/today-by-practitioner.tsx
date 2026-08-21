/**
 * Carte "Par praticien" : la charge de la journée en un coup d'oeil.
 *
 * Barres horizontales proportionnelles au nombre de rendez-vous du jour
 * de chaque praticien — de simples div Tailwind, pas de librairie de
 * graphiques pour trois barres. Chaque praticien garde la couleur
 * stable que la grille agenda lui donne (lib/agenda/colors.ts) : le
 * tableau de bord et l'agenda parlent le même langage visuel.
 */
"use client";

import { resourceColorClasses } from "@/lib/agenda/colors";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useDashboardAgenda } from "@/lib/scheduling/use-dashboard-agenda";

export function TodayByPractitioner() {
  const { isPending, byResourceToday } = useDashboardAgenda();

  // La barre la plus longue = le praticien le plus chargé ; les autres
  // sont proportionnelles à lui.
  const maxCount = Math.max(1, ...(byResourceToday ?? []).map((r) => r.count));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Par praticien</CardTitle>
        <CardDescription>Rendez-vous du jour par agenda.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isPending && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        )}

        {/* Pas d'ErrorState ici : la carte "À confirmer" voisine porte
            déjà l'erreur de la MEME query, inutile de la doubler. */}

        {byResourceToday !== undefined && byResourceToday.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aucun rendez-vous aujourd&apos;hui.
          </p>
        )}

        {byResourceToday !== undefined &&
          byResourceToday.map((load) => (
            <div key={load.resourceId} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{load.resourceName}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {load.count}
                </span>
              </div>
              <div
                aria-hidden="true"
                className="h-1.5 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className={cn(
                    "h-full rounded-full",
                    resourceColorClasses(load.resourceId).dot,
                  )}
                  style={{ width: `${(load.count / maxCount) * 100}%` }}
                />
              </div>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
