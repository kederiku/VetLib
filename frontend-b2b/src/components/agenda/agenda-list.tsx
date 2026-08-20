/**
 * Liste des rendez-vous de la période affichée, groupés par jour.
 *
 * Le backend renvoie les entrées de TOUTE la période à plat ; ce
 * composant les regroupe par jour CLINIQUE via toParisDayKey (jamais
 * getDate(), qui lirait le fuseau du navigateur) et affiche une section
 * par jour de la période — y compris les jours vides, pour que la
 * structure de la semaine reste lisible. Quatre états : premier
 * chargement (squelettes), erreur (Alert + réessayer), période sans
 * aucun rendez-vous (Empty + CTA), et la liste normale.
 */
"use client";

import { CalendarPlus } from "lucide-react";

import { AppointmentRow } from "@/components/agenda/appointment-row";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { AgendaEntryResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import {
  addDays,
  formatDayLong,
  toIsoDate,
  toParisDayKey,
  toParisDisplayDate,
} from "@/lib/date/format";

type AgendaListProps = {
  /** Entrées de la période (undefined tant que rien n'est en cache). */
  entries: AgendaEntryResponse[] | undefined;
  /** Premier jour affiché (lundi en vue semaine, le jour en vue jour). */
  rangeStart: Date;
  /** Nombre de jours affichés (7 ou 1). */
  dayCount: number;
  /** Premier chargement (aucune donnée, même pas d'une période voisine). */
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  onNewAppointment: () => void;
};

export function AgendaList({
  entries,
  rangeStart,
  dayCount,
  isPending,
  isError,
  onRetry,
  onNewAppointment,
}: AgendaListProps) {
  // Premier chargement : squelettes à la silhouette de la vraie liste
  // (titre de jour + deux lignes), pour éviter un saut de mise en page.
  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        {Array.from({ length: Math.min(dayCount, 3) }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Impossible de charger l&apos;agenda.</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          Vérifiez votre connexion, puis réessayez.
          <Button variant="outline" size="sm" onClick={onRetry}>
            Réessayer
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // Regroupement par jour clinique : clé YYYY-MM-DD calculée en
  // Europe/Paris depuis l'instant ISO UTC de chaque entrée.
  const byDay = new Map<string, AgendaEntryResponse[]>();
  for (const entry of entries ?? []) {
    const key = toParisDayKey(entry.starts_at);
    const bucket = byDay.get(key);
    if (bucket === undefined) {
      byDay.set(key, [entry]);
    } else {
      bucket.push(entry);
    }
  }

  // Période entièrement vide : un état dédié avec appel à l'action vaut
  // mieux que 7 sections "Aucun rendez-vous" à la suite.
  if (byDay.size === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarPlus />
          </EmptyMedia>
          <EmptyTitle>Aucun rendez-vous sur cette période</EmptyTitle>
          <EmptyDescription>
            Créez le premier rendez-vous ou naviguez vers une autre semaine.
          </EmptyDescription>
        </EmptyHeader>
        <Button onClick={onNewAppointment}>Nouveau rendez-vous</Button>
      </Empty>
    );
  }

  const days = Array.from({ length: dayCount }, (_, i) =>
    addDays(rangeStart, i),
  );

  return (
    <div className="flex flex-col gap-6">
      {days.map((day) => {
        // toIsoDate produit la même forme YYYY-MM-DD que toParisDayKey :
        // les deux clés se correspondent (poste supposé en Europe/Paris).
        const key = toIsoDate(day);
        // Tri par heure de début : l'API ne garantit pas l'ordre.
        const dayEntries = (byDay.get(key) ?? [])
          .slice()
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

        return (
          <section key={key} className="flex flex-col gap-2">
            {/* first-letter:uppercase : Intl produit "lundi 24 août" en
                minuscules, on capitalise seulement l'initiale.
                toParisDisplayDate : réancre le jour civil à midi UTC
                avant le formatteur Europe/Paris (sinon, titre décalé
                d'un jour pour un poste à l'est de la France). */}
            <h2 className="text-sm font-semibold first-letter:uppercase">
              {formatDayLong(toParisDisplayDate(day))}
            </h2>
            {dayEntries.length === 0 ? (
              <p className="rounded-2xl border border-dashed p-3 text-sm text-muted-foreground">
                Aucun rendez-vous
              </p>
            ) : (
              dayEntries.map((entry) => (
                <AppointmentRow key={entry.id} entry={entry} />
              ))
            )}
          </section>
        );
      })}
    </div>
  );
}
