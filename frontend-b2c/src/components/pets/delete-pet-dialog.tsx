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
 * liste decide quel animal est vise. L'erreur eventuelle s'affiche en
 * Alert DANS le dialogue (l'utilisateur est encore dessus).
 */
"use client";

import { useQueryClient } from "@tanstack/react-query";
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
}

export function DeletePetDialog({
  open,
  onOpenChange,
  pet,
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
      onOpenChange(false);
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
