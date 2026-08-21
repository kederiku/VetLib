/**
 * DeletePetDialog : confirmation avant de retirer un animal du compte.
 *
 * AlertDialog (et non Dialog) : l'action est engageante, il n'y a ni
 * croix de fermeture ni fermeture au clic exterieur — l'utilisateur doit
 * choisir explicitement. Cote backend c'est un SOFT DELETE (deleted_at,
 * jamais de DELETE SQL) : la fiche disparait de la liste mais ses futurs
 * dossiers medicaux seront conserves, d'ou le texte rassurant.
 *
 * Composant pilote par le parent ({ open, onOpenChange, pet }) : la
 * liste ou la fiche decide quel animal est vise.
 *
 * L'erreur reste un bandeau Alert DANS le dialogue, et non un toast :
 * le dialogue ne se ferme PAS en cas d'echec, l'utilisateur est encore
 * dessus et doit choisir entre reessayer et renoncer. C'est la regle du
 * portail -- inline quand il faut AGIR, toast quand on informe.
 *
 * onDeleted (optionnel) : la fiche de l'animal s'en sert pour revenir a
 * la liste. Sans lui, elle resterait montee sur un animal qui n'existe
 * plus et basculerait sur son etat "introuvable", ce qui ressemblerait a
 * une erreur alors que la suppression a reussi.
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
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { getApiError, type ApiError } from "@/lib/api/errors";
import {
  getListMyPetsQueryKey,
  useDeletePet,
} from "@/lib/api/generated/pets/pets";
import type { PetResponse } from "@/lib/api/generated/vetoLibAPI.schemas";

interface DeletePetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pet: PetResponse;
  /** Appele apres une suppression REUSSIE (retour a la liste). */
  onDeleted?: () => void;
}

export function DeletePetDialog({
  open,
  onOpenChange,
  pet,
  onDeleted,
}: DeletePetDialogProps) {
  const queryClient = useQueryClient();
  const deleteMutation = useDeletePet<ApiError>();

  // Message d'erreur local au dialogue : etat d'UI ephemere, efface a
  // chaque nouvelle tentative (et perdu a la fermeture, c'est voulu).
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDelete = async () => {
    setErrorMessage(null);
    try {
      await deleteMutation.mutateAsync({ petId: pet.id });
      // La fiche a disparu cote serveur : on invalide la liste (elle se
      // rafraichit partout, y compris dans le wizard de rendez-vous).
      await queryClient.invalidateQueries({
        queryKey: getListMyPetsQueryKey(),
      });
      toast.success(`${pet.name} a été supprimé`);
      onOpenChange(false);
      onDeleted?.();
    } catch (error) {
      const apiError = getApiError(error);
      // 404 pet_not_found (deja supprime dans un autre onglet ?) ou
      // panne reseau : message dans le dialogue, l'utilisateur choisit
      // de reessayer ou d'annuler.
      setErrorMessage(
        apiError !== null
          ? apiError.detail
          : "Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.",
      );
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer {pet.name} ?</AlertDialogTitle>
          <AlertDialogDescription>
            {pet.name} ne sera plus visible dans votre compte. Ses futurs
            dossiers seront conservés.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {errorMessage !== null && (
          <Alert variant="destructive">
            <AlertTitle>{errorMessage}</AlertTitle>
          </Alert>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          {/* variant destructive : l'action retire une fiche du compte.
              Pas de AlertDialogAction "fermante" automatique ici : on ne
              ferme qu'apres le succes du DELETE (voir handleDelete). */}
          <AlertDialogAction
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending && <Spinner data-icon="inline-start" />}
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
