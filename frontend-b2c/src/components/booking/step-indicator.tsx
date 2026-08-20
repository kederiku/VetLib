/**
 * StepIndicator : le fil d'Ariane du wizard (5 pastilles numerotees).
 *
 * Les etapes PASSEES sont des boutons cliquables (retour en arriere via
 * GO_TO_STEP — le reducer refuse de toute facon les sauts en avant),
 * l'etape COURANTE porte aria-current="step", les etapes futures sont
 * inertes. Les libelles sont masques sur mobile (pastilles seules),
 * comme les libelles du header.
 */
"use client";

import { cn } from "@/lib/utils";

import type { BookingStep } from "@/components/booking/booking-state";

// Libelles des cinq etapes, dans l'ordre. L'index + 1 EST le numero
// d'etape (BookingStep).
const STEP_LABELS = [
  "Clinique",
  "Motif",
  "Animal",
  "Créneau",
  "Confirmation",
] as const;

interface StepIndicatorProps {
  step: BookingStep;
  /** Navigation arriere : appele avec le numero d'une etape passee. */
  onStepClick: (step: BookingStep) => void;
}

export function StepIndicator({ step, onStepClick }: StepIndicatorProps) {
  return (
    // <ol> : la suite d'etapes est une liste ORDONNEE, les lecteurs
    // d'ecran annoncent "liste de 5 elements" et la position de chacun.
    <ol aria-label="Étapes de la réservation" className="flex items-center gap-1 sm:gap-2">
      {STEP_LABELS.map((label, index) => {
        const stepNumber = (index + 1) as BookingStep;
        const isPast = stepNumber < step;
        const isCurrent = stepNumber === step;

        // La pastille : numero dans un cercle. Passee = pleine (couleur
        // primaire, cliquable), courante = pleine + libelle en gras,
        // future = grisee.
        const circle = (
          <span
            aria-hidden
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
              isPast || isCurrent
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground",
            )}
          >
            {stepNumber}
          </span>
        );

        return (
          <li key={label} className="flex items-center gap-1 sm:gap-2">
            {/* Trait de liaison entre les pastilles (sauf avant la 1re). */}
            {index > 0 && <span aria-hidden className="h-px w-3 bg-border sm:w-5" />}
            {isPast ? (
              // Etape passee : un vrai <button> pour y revenir.
              <button
                type="button"
                onClick={() => onStepClick(stepNumber)}
                className="flex items-center gap-1.5 rounded-full outline-none hover:opacity-80 focus-visible:ring-3 focus-visible:ring-ring/30"
              >
                {circle}
                <span className="hidden text-sm text-muted-foreground sm:inline">
                  {label}
                </span>
              </button>
            ) : (
              <span
                aria-current={isCurrent ? "step" : undefined}
                className="flex items-center gap-1.5"
              >
                {circle}
                <span
                  className={cn(
                    "hidden text-sm sm:inline",
                    isCurrent ? "font-medium" : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
