/**
 * BookingWizard : l'orchestrateur du parcours de prise de rendez-vous.
 *
 * Assemble la machine a etats (useReducer, voir booking-state.ts), le
 * fil d'Ariane (StepIndicator), le bouton Retour et l'etape courante.
 * Chaque etape est un composant autonome qui recoit uniquement les
 * tranches d'etat dont elle a besoin et des callbacks qui dispatchent :
 * le wizard est le SEUL a connaitre le reducer.
 *
 * infoMessage : le message d'erreur "transverse" (conflit de creneau,
 * animal disparu) vit ici, dans un useState a cote du reducer — c'est un
 * etat d'UI ephemere, pas un choix de reservation ; il est efface des
 * que l'utilisateur re-selectionne quelque chose.
 *
 * Apres le 201, l'ecran de succes remplace tout : la demande est nee
 * "pending" cote backend, d'ou le badge "En attente de confirmation".
 *
 * PRE-SELECTION PAR L'URL : ?animal=<id> coche d'avance l'animal, pour
 * qu'arriver depuis sa fiche ("Prendre rendez-vous pour Rex") ne
 * redemande pas ce qu'on vient de designer. Le tunnel ne saute AUCUNE
 * etape pour autant -- la clinique et le motif restent a choisir, et
 * l'animal reste modifiable a l'etape 3.
 */
"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";

import {
  bookingReducer,
  initialBookingState,
  type BookingStep,
} from "@/components/booking/booking-state";
import { StepClinic } from "@/components/booking/step-clinic";
import { StepConfirm } from "@/components/booking/step-confirm";
import { StepPet } from "@/components/booking/step-pet";
import { StepSlot } from "@/components/booking/step-slot";
import { StepType } from "@/components/booking/step-type";
import { BookingSummary } from "@/components/booking/booking-summary";
import { StepIndicator } from "@/components/common/step-indicator";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useListMyPets } from "@/lib/api/generated/pets/pets";
import { STATUS_LABELS } from "@/lib/appointments/status";

// Libelles des cinq etapes, dans l'ordre. L'index + 1 EST le numero
// d'etape (BookingStep). Ils vivent ici et non dans le StepIndicator, qui
// est desormais partage avec le parcours d'inscription.
const STEP_LABELS = [
  "Clinique",
  "Motif",
  "Animal",
  "Créneau",
  "Confirmation",
] as const;

export function BookingWizard() {
  const [state, dispatch] = useReducer(bookingReducer, initialBookingState);

  // Message transverse affiche par l'etape concernee (voir docstring).
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // --- Pre-selection de l'animal depuis ?animal=<id>.
  const searchParams = useSearchParams();
  const animalDemande = searchParams.get("animal");
  // Meme queryKey que partout : la liste est probablement deja en cache
  // quand on arrive depuis une fiche animal, donc aucune attente.
  const { data: pets } = useListMyPets({
    query: { select: (res) => res.data, enabled: animalDemande !== null },
  });
  // useRef de garde : la pre-selection ne se dispatche QU'UNE fois. Sans
  // elle, un refetch d'arriere-plan de la liste re-cocherait l'animal de
  // l'URL par-dessus celui que l'utilisateur vient de choisir.
  const dejaPreselectionne = useRef(false);
  const animalPreselectionne = useMemo(
    () =>
      animalDemande === null
        ? undefined
        : pets?.find((pet) => pet.id === animalDemande),
    [animalDemande, pets],
  );

  useEffect(() => {
    if (dejaPreselectionne.current || animalPreselectionne === undefined) {
      return;
    }
    dejaPreselectionne.current = true;
    dispatch({ type: "PRESELECT_PET", pet: animalPreselectionne });
  }, [animalPreselectionne]);
  // Un identifiant qui ne correspond a aucun animal (fiche supprimee
  // entre-temps) est ignore en silence : c'est un parametre de confort,
  // pas une instruction dont l'echec merite un message.

  // Ecran de succes : remplace wizard, fil d'Ariane et bouton Retour.
  if (state.submitted) {
    const pendingStatus = STATUS_LABELS.pending;
    return (
      <PageContainer width="narrow">
        <Card>
          <CardHeader>
            <CardTitle>Demande envoyée !</CardTitle>
            <CardDescription>
              La clinique va confirmer votre rendez-vous.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <Badge variant={pendingStatus.badgeVariant}>
                {pendingStatus.label}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                nativeButton={false}
                render={<Link href="/rendez-vous" />}
              >
                Voir mes rendez-vous
              </Button>
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/tableau-de-bord" />}
              >
                Tableau de bord
              </Button>
            </div>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  // Navigation arriere (pastilles passees et bouton Retour) : le message
  // transverse est efface, l'utilisateur repart sur un ecran propre.
  const goToStep = (step: BookingStep) => {
    setInfoMessage(null);
    dispatch({ type: "GO_TO_STEP", step });
  };

  // Le recapitulatif n'a rien a dire a l'etape 1, et ferait doublon a
  // l'etape 5 avec la carte de confirmation.
  const montrerRecap = state.step > 1 && state.step < 5;

  return (
    <PageContainer>
      <PageHeader title="Prendre rendez-vous" />
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <StepIndicator
            labels={STEP_LABELS}
            ariaLabel="Étapes de la réservation"
            step={state.step}
            // Le composant commun raisonne en number ; le reducteur, lui, exige
            // un BookingStep. La conversion est sure : StepIndicator ne remonte
            // que des numeros d'etapes existantes.
            onStepClick={(step) => goToStep(step as BookingStep)}
          />

          <div>
            {/* Retour : a l'etape 1 on quitte le wizard (retour a la liste),
            ensuite on recule d'une etape via le reducer. */}
            {state.step === 1 ? (
              <Button
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<Link href="/rendez-vous" />}
              >
                <ChevronLeft data-icon="inline-start" aria-hidden />
                Retour
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => goToStep((state.step - 1) as BookingStep)}
              >
                <ChevronLeft data-icon="inline-start" aria-hidden />
                Retour
              </Button>
            )}
          </div>

          {state.step === 1 && (
            <StepClinic
              onSelect={(clinic) => {
                setInfoMessage(null);
                dispatch({ type: "SELECT_CLINIC", clinic });
              }}
            />
          )}

          {state.step === 2 && state.clinic !== null && (
            <StepType
              clinic={state.clinic}
              onSelect={(appointmentType) => {
                setInfoMessage(null);
                dispatch({ type: "SELECT_TYPE", appointmentType });
              }}
            />
          )}

          {state.step === 3 && (
            <StepPet
              selectedPet={state.pet}
              reason={state.reason}
              errorMessage={infoMessage}
              onSelectPet={(pet) => {
                setInfoMessage(null);
                dispatch({ type: "SELECT_PET", pet });
              }}
              onReasonChange={(reason) =>
                dispatch({ type: "SET_REASON", reason })
              }
              onContinue={() => dispatch({ type: "CONFIRM_PET" })}
            />
          )}

          {state.step === 4 &&
            state.clinic !== null &&
            state.appointmentType !== null && (
              <StepSlot
                clinic={state.clinic}
                appointmentType={state.appointmentType}
                conflictMessage={infoMessage}
                onSelect={(slot) => {
                  setInfoMessage(null);
                  dispatch({ type: "SELECT_SLOT", slot });
                }}
              />
            )}

          {/* Les gardes !== null retrecissent les types : StepConfirm recoit
          des props non-nullables. A l'execution, le reducer garantit deja
          que l'etape 5 n'est atteignable qu'avec tout de choisi. */}
          {state.step === 5 &&
            state.clinic !== null &&
            state.appointmentType !== null &&
            state.pet !== null &&
            state.slot !== null && (
              <StepConfirm
                clinic={state.clinic}
                appointmentType={state.appointmentType}
                pet={state.pet}
                reason={state.reason}
                slot={state.slot}
                onSlotConflict={(message) => {
                  setInfoMessage(message);
                  dispatch({ type: "SLOT_CONFLICT" });
                }}
                onPetInvalid={(message) => {
                  setInfoMessage(message);
                  dispatch({ type: "PET_INVALID" });
                }}
                onSubmitted={() => dispatch({ type: "SUBMITTED" })}
              />
            )}
        </div>

        {montrerRecap && <BookingSummary state={state} onGoToStep={goToStep} />}
      </div>
    </PageContainer>
  );
}
