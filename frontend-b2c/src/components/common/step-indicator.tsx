/**
 * StepIndicator : le fil d'Ariane partagé par les parcours en plusieurs
 * étapes du portail (réservation d'un rendez-vous, inscription).
 *
 * Les étapes PASSÉES sont des boutons cliquables (retour en arrière), l'étape
 * COURANTE porte aria-current="step", les étapes futures sont inertes. Les
 * libellés sont masqués sur mobile (pastilles seules), comme les libellés du
 * header.
 *
 * `minStep` verrouille le début du parcours : les étapes situées avant lui
 * s'affichent comme franchies mais restent INERTES. C'est ce dont a besoin
 * l'inscription — une fois le compte créé à l'étape 1, y revenir n'a plus
 * aucun sens, le formulaire de création n'existe plus. Le tunnel de
 * réservation, lui, garde le défaut (tout est réversible tant qu'on n'a pas
 * confirmé).
 */
"use client";

import { cn } from "@/lib/utils";

interface StepIndicatorProps {
  /** Libellés des étapes, dans l'ordre. L'index + 1 EST le numéro d'étape. */
  labels: readonly string[];
  /** Nom accessible de la liste, ex. "Étapes de la réservation". */
  ariaLabel: string;
  /** Numéro (1-based) de l'étape courante. */
  step: number;
  /** Navigation arrière : appelé avec le numéro d'une étape passée. */
  onStepClick: (step: number) => void;
  /** Première étape sur laquelle un retour reste possible (défaut : 1). */
  minStep?: number;
}

export function StepIndicator({
  labels,
  ariaLabel,
  step,
  onStepClick,
  minStep = 1,
}: StepIndicatorProps) {
  return (
    // <ol> : la suite d'etapes est une liste ORDONNEE, les lecteurs
    // d'ecran annoncent "liste de N elements" et la position de chacun.
    <ol aria-label={ariaLabel} className="flex items-center gap-1 sm:gap-2">
      {labels.map((label, index) => {
        const stepNumber = index + 1;
        // "Franchie" et "cliquable" ne sont PAS la meme chose : une etape
        // avant minStep est derriere nous, donc affichee pleine, mais on ne
        // peut plus y retourner.
        const isPast = stepNumber < step;
        const isCurrent = stepNumber === step;
        const isReachable = isPast && stepNumber >= minStep;

        // La pastille : numero dans un cercle. Passee = pleine (couleur
        // primaire), courante = pleine + libelle en gras, future = grisee.
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
            {index > 0 && (
              <span aria-hidden className="h-px w-3 bg-border sm:w-5" />
            )}
            {isReachable ? (
              // Etape passee ET atteignable : un vrai <button> pour y revenir.
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
