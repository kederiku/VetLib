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
import type {
  AgendaEntryResponse,
  AppointmentStatus,
} from "@/lib/api/generated/vetoLibAPI.schemas";
import { formatTimeRange } from "@/lib/date/format";
import { cn } from "@/lib/utils";

// Apparence de chaque état de la machine à états d'un rendez-vous.
// Record<AppointmentStatus, ...> : TypeScript exige une entrée par état,
// un nouvel état backend casserait la compilation ici (voulu).
// rowClass : les rendez-vous annulés restent visibles (historique de la
// journée) mais estompés, pour ne pas voler l'attention.
export const STATUS_META: Record<
  AppointmentStatus,
  {
    label: string;
    variant: React.ComponentProps<typeof Badge>["variant"];
    rowClass?: string;
  }
> = {
  pending: { label: "À confirmer", variant: "outline" },
  confirmed: { label: "Confirmé", variant: "default" },
  completed: { label: "Terminé", variant: "secondary" },
  cancelled: { label: "Annulé", variant: "destructive", rowClass: "opacity-60" },
};

/**
 * Nom du client à afficher : compte propriétaire (prénom + nom) si le
 * RDV vient du portail B2C, sinon le client de passage (guest_name).
 * Exporté : la carte "À confirmer" du tableau de bord l'utilise aussi.
 */
export function formatClientName(entry: AgendaEntryResponse): string {
  if (entry.owner_first_name !== null || entry.owner_last_name !== null) {
    return [entry.owner_first_name, entry.owner_last_name]
      .filter(Boolean)
      .join(" ");
  }
  return entry.guest_name ?? "Client inconnu";
}

export function AppointmentRow({ entry }: { entry: AgendaEntryResponse }) {
  const meta = STATUS_META[entry.status];
  // Animal : pet_name (fiche patient liée) sinon guest_pet_name (saisie
  // libre du staff pour un client de passage), sinon rien.
  const petName = entry.pet_name ?? entry.guest_pet_name;

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
          {petName != null && ` — ${petName}`}
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
      </div>

      <AppointmentActions entry={entry} />
    </div>
  );
}
