/**
 * CancelAppointmentDialog : confirmation avant d'annuler un rendez-vous.
 *
 * AlertDialog (action engageante, choix explicite requis). La regle des
 * 24 h est deja pre-verifiee par canCancel() cote affichage, mais le
 * backend reste l'AUTORITE : s'il repond 409 (delai depasse entre
 * l'affichage et le clic, ou transition invalide), le message metier
 * francais part en TOAST.
 *
 * Pourquoi un toast et non un bandeau inline : le dialogue se ferme dans
 * tous les cas apres la tentative, un bandeau n'aurait donc nulle part
 * ou s'afficher. La regle du portail est la suivante -- si l'utilisateur
 * doit AGIR (corriger un champ), c'est inline ; si on l'informe que
 * c'est fait ou que ca a echoue, c'est un toast.
 *
 * Point cle : meme en cas d'ECHEC on invalide la liste des rendez-vous.
 * Un 409 signifie que notre copie locale etait perimee (statut ou
 * horaire ayant change cote clinique) : re-synchroniser immediatement
 * evite de proposer a nouveau une annulation impossible.
 */
"use client";

import { useQueryClient } from "@tanstack/react-query";
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
import { getApiError, type ApiError } from "@/lib/api/errors";
import {
  getListMyAppointmentsQueryKey,
  useCancelMyAppointment,
} from "@/lib/api/generated/owner-appointments/owner-appointments";
import { getListAvailabilitiesQueryKey } from "@/lib/api/generated/public-clinics/public-clinics";
import type { OwnerAppointmentResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import { businessErrorMessage } from "@/lib/auth/server-errors";
import { formatDateLong, formatTime } from "@/lib/date/format";

interface CancelAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: OwnerAppointmentResponse;
  /** Appele apres une annulation REUSSIE (la fiche de detail s'en sert
   *  pour revenir a la liste). */
  onCancelled?: () => void;
}

export function CancelAppointmentDialog({
  open,
  onOpenChange,
  appointment,
  onCancelled,
}: CancelAppointmentDialogProps) {
  const queryClient = useQueryClient();
  const cancelMutation = useCancelMyAppointment<ApiError>();

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync({ appointmentId: appointment.id });
      // Succes : la liste se rafraichit (le rendez-vous passe en
      // "Annulé"), et l'apercu du compte aussi (meme cle de cache).
      await queryClient.invalidateQueries({
        queryKey: getListMyAppointmentsQueryKey(),
      });
      // L'annulation LIBERE le creneau : les disponibilites de cette
      // clinique en cache (wizard de reservation) sont perimees.
      // Prefixe de cle = tous les mois consultes.
      void queryClient.invalidateQueries({
        queryKey: getListAvailabilitiesQueryKey(appointment.clinic_id),
      });
      toast.success("Rendez-vous annulé");
      onCancelled?.();
    } catch (error) {
      const apiError = getApiError(error);
      // Message metier connu (cancellation_too_late...) -> libelle
      // francais partage ; sinon detail brut ou message reseau.
      toast.error(
        apiError !== null
          ? (businessErrorMessage(apiError.code ?? "") ?? apiError.detail)
          : "Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.",
      );
      // Invalidation MEME en echec : voir la docstring du module.
      await queryClient.invalidateQueries({
        queryKey: getListMyAppointmentsQueryKey(),
      });
    } finally {
      onOpenChange(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Annuler ce rendez-vous ?</AlertDialogTitle>
          {/* pet_name est nullable (rendez-vous pris par la clinique sans
              fiche animal) : on n'affiche le "pour X" que s'il existe. */}
          <AlertDialogDescription>
            {appointment.appointment_type_name}
            {appointment.pet_name !== null && <> pour {appointment.pet_name}</>}{" "}
            le {formatDateLong(appointment.starts_at)} à{" "}
            {formatTime(appointment.starts_at)}, chez{" "}
            {appointment.clinic_name}. La clinique en sera informée.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Garder le rendez-vous</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={handleCancel}
            disabled={cancelMutation.isPending}
          >
            {cancelMutation.isPending && <Spinner data-icon="inline-start" />}
            Annuler le rendez-vous
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
