/**
 * Etape 2 du wizard : choisir le motif (type de rendez-vous).
 *
 * Les types actifs de la clinique choisie (GET /public/clinics/x/
 * appointment-types) sont presentes en cartes-boutons (nom + duree) :
 * comme pour la clinique, le clic selectionne ET avance (dispatch
 * SELECT_TYPE — le reducer efface au passage un eventuel creneau choisi
 * avant, puisque la duree conditionne les disponibilites).
 */
"use client";

import { Clock } from "lucide-react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useListClinicAppointmentTypes } from "@/lib/api/generated/public-clinics/public-clinics";
import type {
  PublicAppointmentTypeResponse,
  PublicClinicResponse,
} from "@/lib/api/generated/vetoLibAPI.schemas";

interface StepTypeProps {
  clinic: PublicClinicResponse;
  onSelect: (appointmentType: PublicAppointmentTypeResponse) => void;
}

export function StepType({ clinic, onSelect }: StepTypeProps) {
  const {
    data: types,
    isPending,
    isError,
  } = useListClinicAppointmentTypes(clinic.id, {
    // Narrowing : la variante 422 de l'union generee n'arrive jamais
    // jusqu'ici (le mutator jette sur tout statut >= 400).
    query: { select: (res) => (res.status === 200 ? res.data : []) },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Quel est le motif de la visite ?
        </h2>
        <p className="text-sm text-muted-foreground">
          Consultations proposées par {clinic.name}.
        </p>
      </div>

      {isPending && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {isError && (
        <Alert variant="destructive">
          <AlertTitle>
            Impossible de charger les motifs de consultation. Vérifiez votre
            connexion et réessayez.
          </AlertTitle>
        </Alert>
      )}

      {types !== undefined && types.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Cette clinique ne propose pas encore de réservation en ligne.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {types?.map((appointmentType) => (
          // Vrai <button> pleine largeur style carte, comme a l'etape 1.
          <button
            key={appointmentType.id}
            type="button"
            onClick={() => onSelect(appointmentType)}
            className="flex w-full items-center justify-between gap-3 rounded-2xl border bg-card p-4 text-left text-card-foreground transition-colors outline-none hover:border-primary/40 hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <span className="font-medium">{appointmentType.name}</span>
            {/* La duree aide a choisir (controle simple vs bilan long). */}
            <span className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
              <Clock className="size-3.5" aria-hidden />
              {appointmentType.duration_minutes} min
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
