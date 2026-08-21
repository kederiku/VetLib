/**
 * Dialog d'annulation d'un rendez-vous, avec raison facultative.
 *
 * Composant CONTRÔLÉ (open/onOpenChange) et autonome : il porte sa
 * mutation, son invalidation et ses toasts. Extrait du menu d'actions
 * pour être partagé par tous les déclencheurs (menu d'une ligne, détail
 * d'un bloc de grille, carte "À confirmer" du tableau de bord) — un
 * seul endroit définit ce que "annuler" veut dire.
 *
 * AlertDialog (et non Dialog) : l'annulation mérite une confirmation
 * explicite, pas une fermeture par clic à côté.
 */
"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { ApiError } from "@/lib/api/errors";
import { useCancelAppointment } from "@/lib/api/generated/scheduling/scheduling";
import type { AgendaEntryResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import { messageForApiError } from "@/lib/auth/server-errors";
import { invalidateAgenda } from "@/lib/scheduling/invalidate-agenda";

type CancelAppointmentDialogProps = {
  entry: AgendaEntryResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CancelAppointmentDialog({
  entry,
  open,
  onOpenChange,
}: CancelAppointmentDialogProps) {
  const queryClient = useQueryClient();
  const cancelMutation = useCancelAppointment<ApiError>();
  // Raison d'annulation : état local simple, pas besoin de
  // react-hook-form pour un unique champ facultatif. Vidée à chaque
  // fermeture (voir close ci-dessous).
  const [cancelReason, setCancelReason] = useState("");

  /**
   * Ferme le dialog en VIDANT la raison saisie.
   *
   * Le nettoyage se fait à la fermeture (et non à l'ouverture) parce
   * que c'est le PARENT qui ouvre le dialog : il passe open à true
   * sans que Base UI appelle onOpenChange, une réinitialisation à
   * l'ouverture n'aurait donc aucun endroit où s'accrocher — hormis un
   * effet, que les règles react-hooks du projet interdisent. Sans ce
   * nettoyage, une raison saisie puis abandonnée (Echap, "Retour")
   * resterait en mémoire et partirait avec l'annulation SUIVANTE :
   * une raison fausse, attachée au mauvais rendez-vous.
   */
  const close = () => {
    setCancelReason("");
    onOpenChange(false);
  };

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync({
        appointmentId: entry.id,
        // "" -> null : la raison est nullable côté backend, une chaîne
        // vide échouerait sa validation.
        data: { cancelled_reason: cancelReason.trim() || null },
      });
      close();
      await invalidateAgenda(queryClient);
      toast.success("Rendez-vous annulé");
    } catch (error) {
      // On ferme pour laisser lire le toast (le 409 invalid_transition
      // signifie le plus souvent qu'un collègue a déjà traité le RDV :
      // le refetch remettra la vue d'aplomb).
      close();
      toast.error(messageForApiError(error));
      await invalidateAgenda(queryClient);
    }
  };

  return (
    // Toute fermeture passe par close() : Echap, clic à l'extérieur et
    // le bouton "Retour" vident donc la raison au même titre qu'une
    // annulation aboutie.
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          onOpenChange(true);
        } else {
          close();
        }
      }}
    >
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
  );
}
