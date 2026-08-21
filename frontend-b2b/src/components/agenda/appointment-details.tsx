/**
 * Détail d'un rendez-vous : tout ce que le backend renvoie, plus les
 * actions de transition en boutons DIRECTS.
 *
 * Rendu dans le Popover ancré au bloc de la grille (voir
 * agenda-event.tsx). C'est ici que vivent les informations que
 * l'ancienne liste n'affichait jamais : l'espèce de l'animal, le
 * téléphone cliquable (tel:) et la raison d'annulation — toutes déjà
 * présentes dans AgendaEntryResponse, aucune requête supplémentaire.
 *
 * Les actions découlent STRICTEMENT de la machine à états backend :
 * pending -> Confirmer / Annuler ; confirmed -> Terminer / Annuler ;
 * completed et cancelled sont finaux (aucune action). Plus de menu "..."
 * : confirmer un rendez-vous est l'action la plus fréquente de
 * l'accueil, elle mérite un bouton visible.
 */
"use client";

import {
  BanIcon,
  ClockIcon,
  FileTextIcon,
  PawPrintIcon,
  PhoneIcon,
  StethoscopeIcon,
  UserIcon,
} from "lucide-react";
import { useState } from "react";

import { CancelAppointmentDialog } from "@/components/agenda/cancel-appointment-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { AgendaEntryResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import {
  STATUS_META,
  formatClientName,
  formatPetLabel,
} from "@/lib/appointments/status";
import { formatDayLong, formatTimeRange } from "@/lib/date/format";
import { useAppointmentTransitions } from "@/lib/scheduling/use-appointment-transitions";

/** Une ligne d'information : icône muette + contenu. */
function DetailRow({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground">
        {icon}
      </span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export function AppointmentDetails({ entry }: { entry: AgendaEntryResponse }) {
  const meta = STATUS_META[entry.status];
  const petLabel = formatPetLabel(entry);
  const transitions = useAppointmentTransitions();
  const [cancelOpen, setCancelOpen] = useState(false);

  return (
    <div className="flex w-72 flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold">
          {entry.appointment_type_name}
        </span>
        <Badge variant={meta.variant}>{meta.label}</Badge>
      </div>

      <div className="flex flex-col gap-1.5">
        <DetailRow icon={<ClockIcon className="size-4" />}>
          <span className="first-letter:uppercase">
            {formatDayLong(entry.starts_at)}
          </span>
          {" · "}
          <span className="tabular-nums">
            {formatTimeRange(entry.starts_at, entry.ends_at)}
          </span>
        </DetailRow>

        <DetailRow icon={<UserIcon className="size-4" />}>
          {formatClientName(entry)}
        </DetailRow>

        {petLabel !== null && (
          <DetailRow icon={<PawPrintIcon className="size-4" />}>
            {petLabel}
          </DetailRow>
        )}

        {entry.owner_phone !== null && (
          <DetailRow icon={<PhoneIcon className="size-4" />}>
            {/* Lien tel: : sur un poste d'accueil équipé (softphone,
                mobile), rappeler le client se fait en un clic. */}
            <a className="underline underline-offset-2" href={`tel:${entry.owner_phone}`}>
              {entry.owner_phone}
            </a>
          </DetailRow>
        )}

        <DetailRow icon={<StethoscopeIcon className="size-4" />}>
          {entry.resource_name}
        </DetailRow>

        {entry.reason !== null && entry.reason !== "" && (
          <DetailRow icon={<FileTextIcon className="size-4" />}>
            <span className="italic">{entry.reason}</span>
          </DetailRow>
        )}

        {/* La promesse du dialog d'annulation ("raison visible dans
            l'agenda") est tenue ici. */}
        {entry.status === "cancelled" &&
          entry.cancelled_reason !== null &&
          entry.cancelled_reason !== "" && (
            <DetailRow icon={<BanIcon className="size-4" />}>
              <span className="italic">Annulé : {entry.cancelled_reason}</span>
            </DetailRow>
          )}
      </div>

      {/* Actions selon l'état — rien pour les états finaux. */}
      {(entry.status === "pending" || entry.status === "confirmed") && (
        <div className="flex items-center gap-2 border-t pt-3">
          {entry.status === "pending" && (
            <Button
              size="sm"
              disabled={transitions.isBusy}
              onClick={() => void transitions.confirm(entry.id)}
            >
              {transitions.isConfirming && <Spinner data-icon="inline-start" />}
              Confirmer
            </Button>
          )}
          {entry.status === "confirmed" && (
            <Button
              size="sm"
              disabled={transitions.isBusy}
              onClick={() => void transitions.complete(entry.id)}
            >
              {transitions.isCompleting && <Spinner data-icon="inline-start" />}
              Terminer
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="text-destructive"
            disabled={transitions.isBusy}
            onClick={() => setCancelOpen(true)}
          >
            Annuler
          </Button>
        </div>
      )}

      <CancelAppointmentDialog
        entry={entry}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
      />
    </div>
  );
}
