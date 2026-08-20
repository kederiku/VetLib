/**
 * AppointmentCard : la carte d'UN rendez-vous dans la liste.
 *
 * Affiche la vue enrichie OwnerAppointmentResponse (noms denormalises
 * par le backend : clinique, type, praticien, animal — aucune requete
 * supplementaire). Le bouton "Annuler" n'apparait que si canCancel()
 * l'autorise (pending/confirmed ET plus de 24 h avant le debut) ; la
 * confirmation passe par CancelAppointmentDialog, et un eventuel refus
 * du backend s'affiche en Alert DANS cette carte (etat local
 * cancelError), au plus pres du rendez-vous concerne.
 */
"use client";

import { CalendarDays, PawPrint, Stethoscope } from "lucide-react";
import { useState } from "react";

import { CancelAppointmentDialog } from "@/components/appointments/cancel-appointment-dialog";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { OwnerAppointmentResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import { canCancel, STATUS_LABELS } from "@/lib/appointments/status";
import { formatDateLong, formatTime } from "@/lib/date/format";

interface AppointmentCardProps {
  appointment: OwnerAppointmentResponse;
  /** L'instant "maintenant" fourni par la liste (partage entre cartes). */
  now: Date;
}

export function AppointmentCard({ appointment, now }: AppointmentCardProps) {
  const status = STATUS_LABELS[appointment.status];
  const [dialogOpen, setDialogOpen] = useState(false);
  // Message d'erreur d'annulation, affiche dans la carte apres un refus
  // du backend (409 delai depasse...). Efface a la prochaine tentative.
  const [cancelError, setCancelError] = useState<string | null>(null);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            {/* Date et heure en tete : c'est l'information que le
                proprietaire cherche en premier dans une liste. */}
            <span className="flex items-center gap-2 font-medium">
              <CalendarDays
                className="size-4 text-muted-foreground"
                aria-hidden
              />
              {formatDateLong(appointment.starts_at)} à{" "}
              {formatTime(appointment.starts_at)}
            </span>
            <span className="text-muted-foreground">
              {appointment.appointment_type_name} — {appointment.clinic_name}
            </span>
          </div>
          <Badge variant={status.badgeVariant}>{status.label}</Badge>
        </div>

        <div className="flex flex-col gap-1 text-sm">
          {/* pet_name nullable : rendez-vous cree par la clinique sans
              fiche animal rattachee. */}
          {appointment.pet_name !== null && (
            <span className="flex items-center gap-2">
              <PawPrint className="size-4 text-muted-foreground" aria-hidden />
              {appointment.pet_name}
            </span>
          )}
          <span className="flex items-center gap-2">
            <Stethoscope
              className="size-4 text-muted-foreground"
              aria-hidden
            />
            {appointment.resource_name}
          </span>
          {appointment.reason !== null && appointment.reason !== "" && (
            <p className="text-muted-foreground">{appointment.reason}</p>
          )}
        </div>

        {cancelError !== null && (
          <Alert variant="destructive">
            <AlertTitle>{cancelError}</AlertTitle>
          </Alert>
        )}

        {/* Pre-verification d'affichage seulement (le backend reste
            l'autorite) : rendez-vous annulable en ligne jusqu'a 24 h
            avant le debut. Un futur annule n'a pas de bouton. */}
        {canCancel(appointment, now) && (
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCancelError(null);
                setDialogOpen(true);
              }}
            >
              Annuler
            </Button>
          </div>
        )}
      </CardContent>

      <CancelAppointmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        appointment={appointment}
        onError={setCancelError}
      />
    </Card>
  );
}
