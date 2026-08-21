/**
 * Une LIGNE de rendez-vous : la brique d'affichage partagée par la liste,
 * le tableau de bord et l'historique d'un animal.
 *
 * Elle remplace l'ancienne carte, qui prenait beaucoup de hauteur pour
 * peu d'information et rendait un historique de vingt visites
 * illisible. La ligne aligne l'heure à gauche (tabular-nums : les
 * chiffres se superposent verticalement d'une ligne à l'autre, ce qui
 * fait à lui seul qu'une liste « paraît propre ») et résume le reste sur
 * deux niveaux.
 *
 * LA LIGNE ENTIERE EST UN LIEN, et ne contient AUCUN bouton. Ce n'est
 * pas un choix esthétique : imbriquer un bouton « Annuler » dans un lien
 * produit des contrôles interactifs emboîtés — comportement clavier
 * ambigu et HTML invalide. L'annulation vit donc sur la page de détail,
 * un clic plus loin : un bon échange pour une action irréversible.
 */
"use client";

import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { OwnerAppointmentResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import { STATUS_LABELS } from "@/lib/appointments/status";
import { formatDateLong, formatDateShort, formatTimeRange } from "@/lib/date/format";
import { cn } from "@/lib/utils";

interface AppointmentRowProps {
  appointment: OwnerAppointmentResponse;
  /** Variante compacte, sans bordure : aperçus en carte (tableau de bord). */
  dense?: boolean;
}

export function AppointmentRow({ appointment, dense = false }: AppointmentRowProps) {
  const status = STATUS_LABELS[appointment.status];

  // Nom accessible complet : un lecteur d'écran ne voit pas la mise en
  // page en colonnes, il a besoin d'une phrase.
  const libelle = [
    appointment.appointment_type_name,
    appointment.pet_name !== null ? `pour ${appointment.pet_name}` : null,
    `le ${formatDateLong(appointment.starts_at)}`,
    `à ${formatTimeRange(appointment.starts_at, appointment.ends_at)}`,
    `chez ${appointment.clinic_name}`,
    status.label,
  ]
    .filter((part) => part !== null)
    .join(", ");

  return (
    <Link
      href={`/rendez-vous/${appointment.id}`}
      aria-label={libelle}
      className={cn(
        "flex items-start gap-4 p-3 transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none",
        dense ? "rounded-xl" : "rounded-2xl border",
      )}
    >
      {/* aria-hidden sur tout le contenu visuel : le nom accessible du
          lien ci-dessus le dit déjà, en phrase. Sans cela, un lecteur
          d'écran lirait tout en double. */}
      <span aria-hidden className="flex min-w-0 flex-1 items-start gap-4">
        <span className="w-24 shrink-0 text-sm font-medium tabular-nums">
          <span className="block">{formatDateShort(appointment.starts_at)}</span>
          <span className="block text-muted-foreground">
            {formatTimeRange(appointment.starts_at, appointment.ends_at)}
          </span>
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">
              {appointment.appointment_type_name}
            </span>
            <Badge variant={status.badgeVariant}>{status.label}</Badge>
          </span>
          <span className="truncate text-sm text-muted-foreground">
            {appointment.clinic_name}
            {appointment.pet_name !== null && <> — {appointment.pet_name}</>}
            {" · "}
            {appointment.resource_name}
          </span>
          {appointment.reason !== null && appointment.reason !== "" && (
            <span className="truncate text-sm text-muted-foreground italic">
              {appointment.reason}
            </span>
          )}
        </span>
      </span>

      <ChevronRightIcon
        aria-hidden
        className="mt-1 size-4 shrink-0 text-muted-foreground"
      />
    </Link>
  );
}
