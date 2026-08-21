/**
 * Un bloc de rendez-vous positionné dans une colonne de la grille.
 *
 * Le bloc reçoit sa géométrie en POURCENTAGES (calculée par
 * lib/agenda/layout.ts) et l'applique en style inline — seul moyen
 * d'exprimer des positions dépendant des données ; tout le reste est
 * en utilitaires Tailwind. Couleur = praticien (hash stable), style =
 * statut (bordure pointillée "à confirmer", délavé "annulé"...). Le
 * clic ouvre le Popover de détail ancré au bloc, avec les actions.
 *
 * React.memo : la grille rend des dizaines de blocs ; le tick de la
 * ligne "maintenant" et les hovers ne doivent pas tous les re-rendre.
 */
"use client";

import { memo } from "react";

import { AppointmentDetails } from "@/components/agenda/appointment-details";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { PositionedEvent } from "@/lib/agenda/layout";
import { resourceColorClasses } from "@/lib/agenda/colors";
import {
  STATUS_META,
  formatClientName,
} from "@/lib/appointments/status";
import { formatTime, formatTimeRange } from "@/lib/date/format";
import { cn } from "@/lib/utils";

function AgendaEventInner({ positioned }: { positioned: PositionedEvent }) {
  const { entry, topPct, heightPct, leftPct, widthPct } = positioned;
  const meta = STATUS_META[entry.status];
  const colors = resourceColorClasses(entry.resource_id);

  // Deux lignes de texte demandent environ 30 min de hauteur (une
  // demi-heure = une cellule de 32 px). En dessous, on n'affiche que
  // l'heure et le client, le reste vit dans le détail.
  // Le seuil porte sur la DURÉE, pas sur le pourcentage : un même
  // rendez-vous de 30 min vaut 4 % sur une journée de 13 h mais 2 % si
  // une garde de nuit étire la fenêtre — le texte disparaîtrait alors
  // sans que le bloc ait changé de taille à l'écran.
  const durationMinutes =
    (new Date(entry.ends_at).getTime() - new Date(entry.starts_at).getTime()) /
    60_000;
  const isCompact = durationMinutes < 30;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "absolute z-10 flex flex-col items-start gap-0.5 overflow-hidden rounded-lg border-l-2 px-1.5 py-1 text-left transition-colors",
              colors.surface,
              colors.border,
              meta.blockClass,
            )}
            style={{
              top: `${topPct}%`,
              height: `${heightPct}%`,
              left: `${leftPct}%`,
              width: `${widthPct}%`,
            }}
            aria-label={`${formatTimeRange(entry.starts_at, entry.ends_at)}, ${
              entry.appointment_type_name
            }, ${formatClientName(entry)}, ${meta.label}, ${entry.resource_name}`}
          />
        }
      >
        <span className="max-w-full truncate text-[11px] leading-tight font-medium tabular-nums">
          {formatTime(entry.starts_at)}
          {" "}
          {formatClientName(entry)}
        </span>
        {!isCompact && (
          <span className="max-w-full truncate text-[11px] leading-tight text-muted-foreground">
            {entry.appointment_type_name}
          </span>
        )}
      </PopoverTrigger>
      {/* align="start" : le panneau s'ouvre le long du bloc, côté le
          plus dégagé (Base UI gère les collisions avec les bords). */}
      <PopoverContent align="start" className="w-auto">
        <AppointmentDetails entry={entry} />
      </PopoverContent>
    </Popover>
  );
}

export const AgendaEvent = memo(AgendaEventInner);
