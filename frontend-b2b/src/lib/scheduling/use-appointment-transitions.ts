/**
 * Transitions d'état d'un rendez-vous : Confirmer et Terminer.
 *
 * Logique extraite en hook pour être partagée par tous les emplacements
 * d'action (détail d'un bloc de la grille, menu des lignes de liste,
 * carte "À confirmer" du tableau de bord) sans dupliquer le trio
 * mutation + invalidation + feedback. L'annulation, qui passe par un
 * dialog de confirmation avec raison, vit dans son propre composant
 * (cancel-appointment-dialog.tsx).
 *
 * Feedback : toast de succès ("Rendez-vous confirmé") et toast d'erreur
 * traduite (messageForApiError) — par exemple le 409 invalid_transition
 * quand un collègue a déjà traité le rendez-vous depuis un autre poste.
 * Après chaque transition, invalidateAgenda refetch TOUTES les vues
 * (grille, tableau de bord) : le backend est la source de vérité, on ne
 * modifie jamais le cache à la main.
 */
"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { ApiError } from "@/lib/api/errors";
import {
  useCompleteAppointment,
  useConfirmAppointment,
} from "@/lib/api/generated/scheduling/scheduling";
import { messageForApiError } from "@/lib/auth/server-errors";
import { invalidateAgenda } from "@/lib/scheduling/invalidate-agenda";

export function useAppointmentTransitions(): {
  confirm: (appointmentId: string) => Promise<void>;
  complete: (appointmentId: string) => Promise<void>;
  isConfirming: boolean;
  isCompleting: boolean;
  isBusy: boolean;
} {
  const queryClient = useQueryClient();
  const confirmMutation = useConfirmAppointment<ApiError>();
  const completeMutation = useCompleteAppointment<ApiError>();

  const run = async (action: () => Promise<unknown>, successMessage: string) => {
    try {
      await action();
      await invalidateAgenda(queryClient);
      toast.success(successMessage);
    } catch (error) {
      toast.error(messageForApiError(error));
    }
  };

  return {
    confirm: (appointmentId) =>
      run(
        () => confirmMutation.mutateAsync({ appointmentId }),
        "Rendez-vous confirmé",
      ),
    complete: (appointmentId) =>
      run(
        () => completeMutation.mutateAsync({ appointmentId }),
        "Rendez-vous terminé",
      ),
    isConfirming: confirmMutation.isPending,
    isCompleting: completeMutation.isPending,
    isBusy: confirmMutation.isPending || completeMutation.isPending,
  };
}
