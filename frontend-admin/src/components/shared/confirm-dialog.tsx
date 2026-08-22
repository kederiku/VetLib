/**
 * Confirmation simple d'une action réversible.
 *
 * Toutes les actions de la console passent par ici, SAUF la suspension d'une
 * clinique, qui a son propre dialogue avec saisie du nom (voir
 * `clinic-suspend-dialog.tsx` pour le raisonnement). Désactiver un compte,
 * le réactiver, rétablir l'accès d'une clinique : ce sont des gestes
 * réversibles, qui touchent une seule personne et ne détruisent rien. Un
 * dialogue qui nomme la cible et l'effet suffit.
 *
 * Le dialogue reste OUVERT pendant la mutation (le bouton porte un spinner)
 * et ne se ferme qu'après : fermer d'abord donnerait l'illusion que c'est
 * fait, y compris quand le serveur refuse.
 */
"use client";

import type { ReactNode } from "react";

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

export function ConfirmDialog({
  open,
  onOpenChange,
  titre,
  description,
  libelleAction,
  destructif = false,
  enCours = false,
  onConfirmer,
}: {
  open: boolean;
  onOpenChange: (ouvert: boolean) => void;
  titre: string;
  description: ReactNode;
  libelleAction: string;
  /** Rouge et vocabulaire d'alerte : réservé à ce qui retire un accès. */
  destructif?: boolean;
  enCours?: boolean;
  onConfirmer: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titre}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            variant={destructif ? "destructive" : "default"}
            disabled={enCours}
            onClick={(evenement) => {
              // preventDefault : sans lui, AlertDialogAction ferme le
              // dialogue immediatement et la mutation finirait dans le vide.
              evenement.preventDefault();
              onConfirmer();
            }}
          >
            {enCours && <Spinner data-icon="inline-start" />}
            {libelleAction}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
