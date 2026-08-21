/**
 * Une colonne de la grille agenda : un JOUR (vue semaine) ou un
 * PRATICIEN (vue jour). Le moteur (agenda-grid.tsx) ne connaît pas
 * cette distinction : la colonne reçoit ses rendez-vous, sa fenêtre
 * horaire et son contexte de création, c'est tout.
 *
 * Trois couches superposées, du fond vers l'avant :
 * 1. les CELLULES de 30 min — de vrais <button> : elles dessinent les
 *    lignes de la grille ET servent de cibles "créer un rendez-vous à
 *    cette heure" (une seule structure pour les deux rôles) ;
 * 2. le voile des heures FERMÉES (vue praticien, réglages d'horaires) —
 *    pointer-events-none : le staff peut quand même cliquer à travers
 *    pour forcer un rendez-vous hors grille (urgence) ;
 * 3. les BLOCS de rendez-vous positionnés, puis la ligne "maintenant".
 */
"use client";

import { useMemo } from "react";

import { AgendaEvent } from "@/components/agenda/agenda-event";
import { AgendaNowIndicator } from "@/components/agenda/agenda-now-indicator";
import type { AgendaEntryResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import type { AgendaWindow } from "@/lib/agenda/layout";
import { layoutDayEvents } from "@/lib/agenda/layout";
import { toParisDayKey } from "@/lib/date/format";
import { cn } from "@/lib/utils";

/** Description abstraite d'une colonne, construite par AgendaContent. */
export type AgendaColumn = {
  /** Clé React stable : dayKey en vue semaine, resource_id en vue jour. */
  key: string;
  /** Contenu de l'en-tête ("lun. 24" ou pastille + nom du praticien). */
  header: React.ReactNode;
  /** Jour clinique de la colonne ("2026-08-24") : ligne "maintenant". */
  dayKey: string;
  /** Date locale du jour de la colonne (pré-remplissage du dialog). */
  date: Date;
  /** Praticien de la colonne en vue jour (pré-remplissage aussi). */
  resourceId?: string;
  entries: AgendaEntryResponse[];
};

/** Plage fermée à griser, en minutes depuis minuit (heure clinique). */
export type ClosedRange = { startMin: number; endMin: number };

export const SLOT_MINUTES = 30;
// Hauteur d'une cellule de 30 min : DOIT rester alignée avec la classe
// h-8 (32 px) des cellules — sert au calcul du scroll initial.
export const SLOT_HEIGHT_PX = 32;

/** "09:30" depuis des minutes — libellés de cellules et pré-remplissage. */
export function minutesToTimeLabel(minutes: number): string {
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mins = String(minutes % 60).padStart(2, "0");
  return `${hours}:${mins}`;
}

type AgendaGridColumnProps = {
  column: AgendaColumn;
  window: AgendaWindow;
  /** Libellé lisible du jour, pour l'aria-label des cellules. */
  dayLabel: string;
  onSlotClick: (slot: { date: Date; time: string; resourceId?: string }) => void;
  closedRanges?: ClosedRange[];
};

export function AgendaGridColumn({
  column,
  window,
  dayLabel,
  onSlotClick,
  closedRanges,
}: AgendaGridColumnProps) {
  const totalMinutes = window.endMin - window.startMin;

  // Géométrie des blocs : recalculée seulement quand les rendez-vous ou
  // la fenêtre changent (pas au tick de la ligne "maintenant").
  const positionedEvents = useMemo(
    () => layoutDayEvents(column.entries, window),
    [column.entries, window],
  );

  // Une cellule par tranche de 30 min de la fenêtre.
  const slotStarts = useMemo(() => {
    const starts: number[] = [];
    for (let min = window.startMin; min < window.endMin; min += SLOT_MINUTES) {
      starts.push(min);
    }
    return starts;
  }, [window]);

  const isToday = column.dayKey === toParisDayKey(new Date().toISOString());

  return (
    <div className="relative border-l">
      {/* Couche 1 : cellules cliquables. Bordure basse marquée sur les
          heures pleines, discrète sur les demi-heures — ce sont ELLES
          qui dessinent la grille. */}
      {slotStarts.map((slotStart) => (
        <button
          key={slotStart}
          type="button"
          className={cn(
            "block h-8 w-full border-b hover:bg-muted/60",
            (slotStart + SLOT_MINUTES) % 60 === 0
              ? "border-border"
              : "border-border/40",
          )}
          aria-label={`Créer un rendez-vous ${dayLabel} à ${minutesToTimeLabel(slotStart)}`}
          onClick={() =>
            onSlotClick({
              date: column.date,
              time: minutesToTimeLabel(slotStart),
              resourceId: column.resourceId,
            })
          }
        />
      ))}

      {/* Couche 2 : heures fermées (réglages du praticien). */}
      {closedRanges?.map((range) => (
        <div
          key={`${range.startMin}-${range.endMin}`}
          aria-hidden="true"
          className="pointer-events-none absolute right-0 left-0 z-[5] bg-muted/50"
          style={{
            top: `${((range.startMin - window.startMin) / totalMinutes) * 100}%`,
            height: `${((range.endMin - range.startMin) / totalMinutes) * 100}%`,
          }}
        />
      ))}

      {/* Couche 3 : les rendez-vous, puis la ligne "maintenant". */}
      {positionedEvents.map((positioned) => (
        <AgendaEvent key={positioned.entry.id} positioned={positioned} />
      ))}

      {isToday && <AgendaNowIndicator window={window} />}
    </div>
  );
}
