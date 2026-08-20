/**
 * Etape 5 du wizard : recapitulatif et envoi de la demande.
 *
 * Le POST /owner/appointments renvoie le starts_at ISO du creneau TEL
 * QUE recu du backend a l'etape 4 — aucune conversion de fuseau cote
 * front, c'est le contrat (le front formate, il ne calcule jamais).
 *
 * GESTION DES ERREURS metier, trois familles :
 * - 409 slot_already_booked / slot_unavailable : la course est perdue,
 *   quelqu'un a pris le creneau. On previent le wizard (SLOT_CONFLICT :
 *   retour etape 4 sans creneau) et on invalide les disponibilites de la
 *   clinique PAR PREFIXE de cle (tous les mois en cache, pas seulement
 *   celui du creneau perdu) pour que le calendrier se rafraichisse ;
 * - 404 pet_not_found : l'animal a disparu (supprime dans un autre
 *   onglet ?) — retour etape 3 et invalidation de la liste des animaux ;
 * - autre (panne, 422 inattendu) : Alert locale, l'utilisateur reessaie.
 */
"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  Clock,
  MapPin,
  MessageSquareText,
  Stethoscope,
} from "lucide-react";
import { useState } from "react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { getApiError, type ApiError } from "@/lib/api/errors";
import {
  getListMyAppointmentsQueryKey,
  useBookAppointment,
} from "@/lib/api/generated/owner-appointments/owner-appointments";
import { getListMyPetsQueryKey } from "@/lib/api/generated/pets/pets";
import { getListAvailabilitiesQueryKey } from "@/lib/api/generated/public-clinics/public-clinics";
import type {
  AvailabilitySlotResponse,
  PetResponse,
  PublicAppointmentTypeResponse,
  PublicClinicResponse,
} from "@/lib/api/generated/vetoLibAPI.schemas";
import { businessErrorMessage } from "@/lib/auth/server-errors";
import { formatDateLong, formatTime } from "@/lib/date/format";
import { SPECIES } from "@/lib/pets/species";

interface StepConfirmProps {
  clinic: PublicClinicResponse;
  appointmentType: PublicAppointmentTypeResponse;
  pet: PetResponse;
  reason: string;
  slot: AvailabilitySlotResponse;
  /** 409 sur le creneau : le wizard revient a l'etape 4 avec ce message. */
  onSlotConflict: (message: string) => void;
  /** 404 sur l'animal : le wizard revient a l'etape 3 avec ce message. */
  onPetInvalid: (message: string) => void;
  /** 201 : le wizard bascule sur l'ecran de succes. */
  onSubmitted: () => void;
}

export function StepConfirm({
  clinic,
  appointmentType,
  pet,
  reason,
  slot,
  onSlotConflict,
  onPetInvalid,
  onSubmitted,
}: StepConfirmProps) {
  const queryClient = useQueryClient();
  const bookMutation = useBookAppointment<ApiError>();

  // Erreur "autre" (ni conflit de creneau ni animal disparu) : affichee
  // ici, au-dessus du bouton.
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const PetIcon = SPECIES[pet.species].icon;

  const handleConfirm = async () => {
    setErrorMessage(null);
    try {
      await bookMutation.mutateAsync({
        data: {
          clinic_id: clinic.id,
          appointment_type_id: appointmentType.id,
          resource_id: slot.resource_id,
          // TEL QUEL : l'ISO UTC recu du backend, sans reformatage.
          starts_at: slot.starts_at,
          pet_id: pet.id,
          // "" -> undefined : ne pas envoyer un motif vide.
          reason: reason || undefined,
        },
      });

      // La demande existe desormais cote serveur : la liste /rendez-vous
      // (et l'apercu du compte, meme cle) se rafraichiront.
      await queryClient.invalidateQueries({
        queryKey: getListMyAppointmentsQueryKey(),
      });
      onSubmitted();
    } catch (error) {
      const apiError = getApiError(error);
      const code = apiError?.code;

      if (
        apiError !== null &&
        (code === "scheduling.slot_already_booked" ||
          code === "scheduling.slot_unavailable")
      ) {
        // Invalidation PAR PREFIXE : la cle sans params ([chemin]) matche
        // tous les mois de disponibilites de cette clinique en cache.
        void queryClient.invalidateQueries({
          queryKey: getListAvailabilitiesQueryKey(clinic.id),
        });
        onSlotConflict(businessErrorMessage(code) ?? apiError.detail);
        return;
      }

      if (apiError !== null && code === "patients.pet_not_found") {
        void queryClient.invalidateQueries({
          queryKey: getListMyPetsQueryKey(),
        });
        onPetInvalid(businessErrorMessage(code) ?? apiError.detail);
        return;
      }

      setErrorMessage(
        apiError !== null
          ? apiError.detail
          : "Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.",
      );
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Vérifiez votre demande
        </h2>
        <p className="text-sm text-muted-foreground">
          Un dernier coup d&apos;œil avant l&apos;envoi.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{appointmentType.name}</CardTitle>
          <CardDescription>
            {/* Ce n'est pas encore un rendez-vous ferme : la demande nait
                "en attente", la clinique la confirme (ou non). */}
            La clinique confirmera votre demande.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <span className="flex items-center gap-2 font-medium">
            <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
            {formatDateLong(slot.starts_at)} à {formatTime(slot.starts_at)}
          </span>
          <span className="flex items-center gap-2">
            <MapPin className="size-4 text-muted-foreground" aria-hidden />
            {clinic.name}
            {clinic.city !== null && ` — ${clinic.city}`}
          </span>
          <span className="flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" aria-hidden />
            {appointmentType.duration_minutes} min
          </span>
          <span className="flex items-center gap-2">
            <Stethoscope className="size-4 text-muted-foreground" aria-hidden />
            {slot.resource_name}
          </span>
          <span className="flex items-center gap-2">
            <PetIcon className="size-4 text-muted-foreground" aria-hidden />
            {pet.name}
          </span>
          {reason !== "" && (
            <span className="flex items-start gap-2 text-muted-foreground">
              <MessageSquareText className="mt-0.5 size-4 shrink-0" aria-hidden />
              {reason}
            </span>
          )}
        </CardContent>
      </Card>

      {errorMessage !== null && (
        <Alert variant="destructive">
          <AlertTitle>{errorMessage}</AlertTitle>
        </Alert>
      )}

      <div>
        <Button
          size="lg"
          onClick={handleConfirm}
          disabled={bookMutation.isPending}
        >
          {bookMutation.isPending && <Spinner data-icon="inline-start" />}
          Confirmer ma demande
        </Button>
      </div>
    </div>
  );
}
