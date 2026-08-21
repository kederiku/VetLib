/**
 * Moteur de la grille agenda : conteneur scrollable, en-têtes sticky,
 * gouttière des heures et colonnes.
 *
 * Le moteur est AGNOSTIQUE : il reçoit des colonnes abstraites (7 jours
 * en vue semaine, N praticiens en vue jour) et les rend côte à côte sur
 * un axe vertical du temps. Remplace la liste de jours empilés : les
 * trous de planning, la charge d'une journée et les chevauchements se
 * VOIENT, et un créneau vide se clique pour créer un rendez-vous.
 *
 * Détail d'implémentation : le nombre de colonnes est dynamique, le
 * gridTemplateColumns passe donc en style inline (une classe Tailwind
 * construite ne serait pas compilée). L'en-tête est sticky DANS le
 * conteneur overflow (position par rapport à lui), la gouttière sticky
 * à gauche pour le défilement horizontal sur écran étroit.
 */
"use client";

import { useLayoutEffect, useMemo, useRef } from "react";

import {
  AgendaGridColumn,
  SLOT_HEIGHT_PX,
  SLOT_MINUTES,
  minutesToTimeLabel,
  type AgendaColumn,
  type ClosedRange,
} from "@/components/agenda/agenda-grid-column";
import { ErrorState } from "@/components/shared/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { AgendaWindow } from "@/lib/agenda/layout";
import { getParisMinutesOfDay } from "@/lib/date/format";
import { cn } from "@/lib/utils";

type AgendaGridProps = {
  columns: AgendaColumn[];
  window: AgendaWindow;
  /** Libellé du jour par colonne (aria-label des cellules). */
  dayLabels: string[];
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  onSlotClick: (slot: { date: Date; time: string; resourceId?: string }) => void;
  /** Heures fermées par colonne (clé = column.key), si connues. */
  closedRangesByColumn?: Map<string, ClosedRange[]>;
  /** Change quand la période affichée change : repositionne le scroll. */
  periodKey: string;
};

export function AgendaGrid({
  columns,
  window,
  dayLabels,
  isPending,
  isError,
  onRetry,
  onSlotClick,
  closedRangesByColumn,
  periodKey,
}: AgendaGridProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Heures pleines de la fenêtre, pour la gouttière.
  const hourStarts = useMemo(() => {
    const hours: number[] = [];
    for (let min = window.startMin; min < window.endMin; min += 60) {
      hours.push(min);
    }
    return hours;
  }, [window]);

  // Scroll initial : positionner la vue sur le début de l'activité (30
  // min avant le premier rendez-vous), par défaut 8 h. useLayoutEffect :
  // avant la peinture, l'utilisateur ne voit jamais le "saut".
  const firstEventMin = useMemo(() => {
    let min = Number.POSITIVE_INFINITY;
    for (const column of columns) {
      for (const entry of column.entries) {
        min = Math.min(min, getParisMinutesOfDay(entry.starts_at));
      }
    }
    return Number.isFinite(min) ? min : 8 * 60;
  }, [columns]);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (container === null) {
      return;
    }
    const targetMin = Math.max(window.startMin, firstEventMin - 30);
    container.scrollTop =
      ((targetMin - window.startMin) / SLOT_MINUTES) * SLOT_HEIGHT_PX;
    // isPending EST une dépendance indispensable, pas un détail : au
    // premier rendu (et sur toute période absente du cache) la branche
    // squelette est affichée et ne porte PAS scrollRef — l'effet
    // sortirait sur container === null et ne se rejouerait jamais, car
    // periodKey ne bouge pas entre le squelette et les données. La
    // grille resterait alors calée sur le haut de la fenêtre.
    // periodKey : on repositionne au changement de période/vue, pas à
    // chaque refetch d'une même semaine déjà affichée.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodKey, isPending]);

  if (isError) {
    return (
      <ErrorState title="Impossible de charger l'agenda." onRetry={onRetry} />
    );
  }

  // Squelette EN FORME de grille : cadre, en-têtes et quelques blocs
  // fantômes — l'écran ne "saute" pas quand les données arrivent. Les
  // colonnes peuvent être inconnues pendant le chargement (vue jour en
  // attente des praticiens) : on en dessine 3 par défaut.
  if (isPending) {
    const skeletonKeys =
      columns.length > 0 ? columns.map((column) => column.key) : ["a", "b", "c"];
    return (
      <div className="rounded-2xl border p-3">
        <div className="mb-3 flex gap-3 pl-12">
          {skeletonKeys.map((key) => (
            <Skeleton key={key} className="h-5 flex-1" />
          ))}
        </div>
        <div className="flex gap-3 pl-12">
          {skeletonKeys.map((key, index) => (
            <div key={key} className="flex flex-1 flex-col gap-2">
              {/* Décalages variés : silhouette d'un planning, pas un mur. */}
              <Skeleton
                className="w-full"
                style={{ height: 40 + ((index * 37) % 80) }}
              />
              <Skeleton
                className="w-full"
                style={{ height: 30 + ((index * 53) % 60) }}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const gridTemplateColumns = `3rem repeat(${columns.length}, minmax(7.5rem, 1fr))`;

  return (
    // isolate : confine les z-index internes (en-tête, blocs, ligne
    // "maintenant") — rien ne passe au-dessus du header de l'app.
    <div
      ref={scrollRef}
      className="relative isolate max-h-[calc(100svh-14rem)] overflow-auto rounded-2xl border bg-background"
    >
      {/* En-tête sticky : reste visible en défilant dans la journée. */}
      <div
        className="sticky top-0 z-30 grid border-b bg-background"
        style={{ gridTemplateColumns }}
      >
        <div className="sticky left-0 z-10 bg-background" aria-hidden="true" />
        {columns.map((column) => (
          <div
            key={column.key}
            className="flex h-10 items-center justify-center border-l px-1 text-sm"
          >
            {column.header}
          </div>
        ))}
      </div>

      {/* Corps : gouttière des heures + colonnes. */}
      <div className="grid" style={{ gridTemplateColumns }}>
        {/* Gouttière : purement visuelle (aria-hidden), sticky à gauche
            pour rester lisible en défilement horizontal mobile.
            z-30 : au-dessus des blocs de rendez-vous (z-10) et de la
            ligne "maintenant" (z-20), sinon les blocs défileraient
            PAR-DESSUS les libellés d'heures sur écran étroit. */}
        <div
          aria-hidden="true"
          className="sticky left-0 z-30 bg-background"
        >
          {hourStarts.map((hourStart, index) => (
            <div key={hourStart} className="relative h-16">
              {/* Pas de libellé sur la première heure : il chevaucherait
                  l'en-têtes sticky. */}
              {index > 0 && (
                <span className="absolute -top-2 right-1.5 text-[10px] text-muted-foreground tabular-nums">
                  {minutesToTimeLabel(hourStart)}
                </span>
              )}
            </div>
          ))}
        </div>

        {columns.map((column, index) => (
          <AgendaGridColumn
            key={column.key}
            column={column}
            window={window}
            dayLabel={dayLabels[index] ?? ""}
            onSlotClick={onSlotClick}
            closedRanges={closedRangesByColumn?.get(column.key)}
          />
        ))}
      </div>
    </div>
  );
}

/** En-tête de colonne "jour" (vue semaine) : "lun. 24", aujourd'hui accentué. */
export function DayColumnHeader({
  label,
  isToday,
}: {
  label: string;
  isToday: boolean;
}) {
  return (
    <span
      className={cn(
        "truncate font-medium first-letter:uppercase",
        isToday ? "text-primary" : "text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

/** En-tête de colonne "praticien" (vue jour) : pastille couleur + nom. */
export function ResourceColumnHeader({
  name,
  dotClass,
}: {
  name: string;
  dotClass: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span
        aria-hidden="true"
        className={cn("size-2 shrink-0 rounded-full", dotClass)}
      />
      <span className="truncate font-medium">{name}</span>
    </span>
  );
}
