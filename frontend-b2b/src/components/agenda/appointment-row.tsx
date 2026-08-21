/**
 * Une ligne de rendez-vous dans la liste de l'agenda.
 *
 * Composant PUREMENT d'affichage : il reçoit une AgendaEntryResponse
 * déjà enrichie par le backend (noms dénormalisés du type, du praticien,
 * du client, de l'animal) et la met en page — aucune requête ici. Les
 * actions (confirmer, terminer, annuler) sont déléguées à
 * AppointmentActions, qui porte ses propres mutations.
 */
"use client";

import { AppointmentActions } from "@/components/agenda/appointment-actions";
import { Badge } from "@/components/ui/badge";
import type { AgendaEntryResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import {
  STATUS_META,
  formatClientName,
  formatPetLabel,
} from "@/lib/appointments/status";
import { formatTimeRange } from "@/lib/date/format";
import { cn } from "@/lib/utils";

export function AppointmentRow({ entry }: { entry: AgendaEntryResponse }) {
  // Libellés et couleurs de statut : source unique partagée avec la
  // grille agenda et le tableau de bord (lib/appointments/status.ts).
  const meta = STATUS_META[entry.status];
  // "Rex (chien)" : nom de l'animal, espèce incluse quand elle est connue.
  const petLabel = formatPetLabel(entry);

  return (
    <div
      className={cn(
        "flex items-start gap-4 rounded-2xl border p-3",
        meta.rowClass,
      )}
    >
      {/* tabular-nums : chiffres à chasse fixe, les horaires s'alignent
          verticalement d'une ligne à l'autre. */}
      <div className="w-28 shrink-0 pt-0.5 text-sm font-medium tabular-nums">
        {formatTimeRange(entry.starts_at, entry.ends_at)}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">
            {entry.appointment_type_name}
          </span>
          <Badge variant={meta.variant}>{meta.label}</Badge>
        </div>

        <p className="truncate text-sm text-muted-foreground">
          {formatClientName(entry)}
          {petLabel != null && ` — ${petLabel}`}
          {" · "}
          {entry.resource_name}
        </p>

        {/* Téléphone du propriétaire : l'info dont l'accueil a besoin
            pour confirmer ou déplacer un rendez-vous. */}
        {entry.owner_phone !== null && (
          <p className="text-sm text-muted-foreground">{entry.owner_phone}</p>
        )}

        {entry.reason !== null && entry.reason !== "" && (
          <p className="truncate text-sm text-muted-foreground italic">
            {entry.reason}
          </p>
        )}

        {/* Raison d'annulation : le dialog d'annulation promet qu'elle
            sera "visible dans l'agenda" — c'est ici que la promesse est
            tenue pour les lignes de liste. */}
        {entry.status === "cancelled" &&
          entry.cancelled_reason !== null &&
          entry.cancelled_reason !== "" && (
            <p className="truncate text-sm text-muted-foreground italic">
              Annulé : {entry.cancelled_reason}
            </p>
          )}
      </div>

      <AppointmentActions entry={entry} />
    </div>
  );
}
