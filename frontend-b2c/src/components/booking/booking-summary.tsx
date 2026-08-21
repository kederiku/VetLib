/**
 * Récapitulatif persistant des choix, affiché pendant le tunnel.
 *
 * Il répond à une question que le fil d'étapes ne traite pas :
 * l'indicateur dit OU l'on en est, ce récapitulatif dit CE QU'ON A
 * CHOISI. Sans lui, arrivé à l'étape du créneau, on ne voit plus quelle
 * clinique ni quel motif on a retenus — et revenir vérifier oblige à
 * tout re-choisir en aval.
 *
 * Il n'apparaît PAS à l'étape 1 (rien à récapituler) ni à l'étape 5, où
 * l'écran de confirmation affiche déjà son propre récapitulatif complet
 * — deux récapitulatifs côte à côte seraient du bruit.
 *
 * Chaque ligne renseignée est modifiable : le lien ramène à SON étape,
 * via la même action de navigation arrière que les pastilles du fil.
 */
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  BookingState,
  BookingStep,
} from "@/components/booking/booking-state";
import { formatDateShort, formatTime } from "@/lib/date/format";

interface BookingSummaryProps {
  state: BookingState;
  onGoToStep: (step: BookingStep) => void;
}

export function BookingSummary({ state, onGoToStep }: BookingSummaryProps) {
  const lignes: { terme: string; valeur: string | null; step: BookingStep }[] =
    [
      { terme: "Clinique", valeur: state.clinic?.name ?? null, step: 1 },
      { terme: "Motif", valeur: state.appointmentType?.name ?? null, step: 2 },
      { terme: "Animal", valeur: state.pet?.name ?? null, step: 3 },
      {
        terme: "Créneau",
        valeur:
          state.slot === null
            ? null
            : `${formatDateShort(state.slot.starts_at)} à ${formatTime(state.slot.starts_at)}`,
        step: 4,
      },
    ];

  return (
    <Card size="sm" className="lg:sticky lg:top-20">
      <CardHeader>
        <CardTitle>Votre demande</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-3">
          {lignes.map((ligne) => (
            <div key={ligne.terme} className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">{ligne.terme}</dt>
              <dd className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                {ligne.valeur === null ? (
                  <span className="text-muted-foreground italic">
                    À choisir
                  </span>
                ) : (
                  <>
                    <span className="min-w-0 truncate font-medium">
                      {ligne.valeur}
                    </span>
                    {/* Le retour arriere ne detruit aucun choix : c'est
                        re-CHOISIR qui invalide l'aval, via les actions
                        SELECT_* du reducteur. */}
                    {/* aria-label plutot qu'un <span sr-only> accole :
                        JSX avale l'espace de tete d'un texte en debut de
                        ligne, le nom accessible devenait
                        "Modifieranimal". Quatre boutons "Modifier"
                        indistinguables seraient de toute facon
                        inutilisables au lecteur d'ecran. */}
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto px-0"
                      aria-label={`Modifier ${ligne.terme.toLowerCase()}`}
                      onClick={() => onGoToStep(ligne.step)}
                    >
                      Modifier
                    </Button>
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
