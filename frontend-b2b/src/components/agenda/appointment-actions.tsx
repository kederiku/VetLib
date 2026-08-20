/**
 * Menu d'actions d'un rendez-vous (transitions de la machine à états).
 *
 * Les actions proposées découlent STRICTEMENT de l'état courant :
 * pending -> Confirmer / Annuler ; confirmed -> Terminer / Annuler ;
 * completed et cancelled sont des états finaux (pas de menu du tout).
 * Confirmer et Terminer partent directement ; Annuler passe par un
 * AlertDialog (action à conséquence pour le client) avec une raison
 * facultative. Ces mutations vivent HORS formulaire : les erreurs sont
 * traduites par messageForApiError et affichées dans une Alert locale —
 * par exemple le 409 invalid_transition quand un collègue a déjà traité
 * le rendez-vous depuis un autre poste.
 */
"use client";

import { useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { ApiError } from "@/lib/api/errors";
import {
  useCancelAppointment,
  useCompleteAppointment,
  useConfirmAppointment,
} from "@/lib/api/generated/scheduling/scheduling";
import type { AgendaEntryResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import { messageForApiError } from "@/lib/auth/server-errors";
import { invalidateAgenda } from "@/lib/scheduling/invalidate-agenda";

export function AppointmentActions({ entry }: { entry: AgendaEntryResponse }) {
  const queryClient = useQueryClient();

  // Erreur de la DERNIÈRE action tentée sur cette ligne (chaîne déjà
  // traduite en français). Effacée à chaque nouvelle tentative.
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  // Raison d'annulation : état local simple, pas besoin de react-hook-form
  // pour un unique champ facultatif.
  const [cancelReason, setCancelReason] = useState("");

  const confirmMutation = useConfirmAppointment<ApiError>();
  const completeMutation = useCompleteAppointment<ApiError>();
  const cancelMutation = useCancelAppointment<ApiError>();

  /**
   * Exécute une transition directe (Confirmer, Terminer) puis invalide
   * l'agenda : la ligne se remet à jour via le refetch, on ne modifie
   * jamais le cache à la main (le backend est la source de vérité).
   */
  const runTransition = async (action: () => Promise<unknown>) => {
    setErrorMessage(null);
    try {
      await action();
      await invalidateAgenda(queryClient);
    } catch (error) {
      setErrorMessage(messageForApiError(error));
    }
  };

  const handleCancel = async () => {
    setErrorMessage(null);
    try {
      await cancelMutation.mutateAsync({
        appointmentId: entry.id,
        // "" -> null : la raison est nullable côté backend, une chaîne
        // vide échouerait sa validation.
        data: { cancelled_reason: cancelReason.trim() || null },
      });
      setCancelOpen(false);
      await invalidateAgenda(queryClient);
    } catch (error) {
      // On ferme le dialog pour laisser lire l'erreur dans la ligne.
      setCancelOpen(false);
      setErrorMessage(messageForApiError(error));
    }
  };

  // États finaux : rien à faire, pas de menu (plutôt qu'un menu vide).
  if (entry.status !== "pending" && entry.status !== "confirmed") {
    return null;
  }

  const isBusy =
    confirmMutation.isPending ||
    completeMutation.isPending ||
    cancelMutation.isPending;

  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Actions sur le rendez-vous"
              disabled={isBusy}
            />
          }
        >
          {isBusy ? <Spinner /> : <MoreHorizontal />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {entry.status === "pending" && (
            <DropdownMenuItem
              onClick={() =>
                runTransition(() =>
                  confirmMutation.mutateAsync({ appointmentId: entry.id }),
                )
              }
            >
              Confirmer
            </DropdownMenuItem>
          )}
          {entry.status === "confirmed" && (
            <DropdownMenuItem
              onClick={() =>
                runTransition(() =>
                  completeMutation.mutateAsync({ appointmentId: entry.id }),
                )
              }
            >
              Terminer
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              setCancelReason("");
              setCancelOpen(true);
            }}
          >
            Annuler
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {errorMessage !== null && (
        <Alert variant="destructive" className="w-auto max-w-xs">
          <AlertTitle>{errorMessage}</AlertTitle>
        </Alert>
      )}

      {/* AlertDialog (et non Dialog) : l'annulation mérite une
          confirmation explicite, pas une fermeture par clic à côté. */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler ce rendez-vous ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le rendez-vous passera à l&apos;état « Annulé ». Vous pouvez
              indiquer une raison, visible dans l&apos;agenda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            placeholder="Raison de l'annulation (facultatif)"
            aria-label="Raison de l'annulation"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Retour</AlertDialogCancel>
            {/* AlertDialogAction est un simple Button (il ne ferme PAS le
                dialog tout seul) : on garde la main pour attendre la
                mutation avant de fermer. */}
            <AlertDialogAction
              variant="destructive"
              disabled={cancelMutation.isPending}
              onClick={handleCancel}
            >
              {cancelMutation.isPending && <Spinner data-icon="inline-start" />}
              Annuler le rendez-vous
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
