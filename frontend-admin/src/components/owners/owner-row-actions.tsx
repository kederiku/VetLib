/**
 * Menu d'actions d'une ligne de la liste des propriétaires.
 *
 * Deux gestes seulement : corriger la fiche, et couper (ou rétablir)
 * l'accès. Rien qui touche aux animaux, aux rendez-vous ni à l'historique
 * médical : la console d'exploitation gère des COMPTES, pas des dossiers de
 * soins. C'est une limite délibérée, pas une fonctionnalité manquante.
 */
"use client";

import {
  MoreHorizontalIcon,
  PencilIcon,
  UserMinusIcon,
  UserPlusIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { OwnerEditDialog } from "@/components/owners/owner-edit-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ApiError } from "@/lib/api/errors";
import {
  useDeactivateAdminOwner,
  useReactivateAdminOwner,
} from "@/lib/api/generated/admin-owners/admin-owners";
import type { AdminOwnerSummary } from "@/lib/api/generated/vetoLibAPI.schemas";
import { messageForApiError } from "@/lib/auth/server-errors";
import { useInvaliderProprietaires } from "@/lib/owners/mutations";

export function OwnerRowActions({
  proprietaire,
}: {
  proprietaire: AdminOwnerSummary;
}) {
  const [editionOuverte, setEditionOuverte] = useState(false);
  const [statutOuvert, setStatutOuvert] = useState(false);
  // Remonte le dialogue d'édition à chaque ouverture : sans cela, la saisie
  // abandonnée du passage précédent serait encore là.
  const [cleEdition, setCleEdition] = useState(0);
  const invalider = useInvaliderProprietaires();
  const desactivation = useDeactivateAdminOwner<ApiError>();
  const reactivation = useReactivateAdminOwner<ApiError>();

  const enCours = desactivation.isPending || reactivation.isPending;
  const nomComplet = `${proprietaire.first_name} ${proprietaire.last_name}`;

  const changerStatut = async () => {
    try {
      if (proprietaire.is_active) {
        await desactivation.mutateAsync({ ownerId: proprietaire.id });
      } else {
        await reactivation.mutateAsync({ ownerId: proprietaire.id });
      }
      toast.success(proprietaire.is_active ? "Accès retiré" : "Accès rétabli");
    } catch (erreur) {
      toast.error(messageForApiError(erreur));
    } finally {
      await invalider(proprietaire.id);
      setStatutOuvert(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions pour ${nomComplet}`}
            />
          }
        >
          <MoreHorizontalIcon aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => {
              setCleEdition((valeur) => valeur + 1);
              setEditionOuverte(true);
            }}
          >
            <PencilIcon aria-hidden />
            Modifier la fiche
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {proprietaire.is_active ? (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setStatutOuvert(true)}
            >
              <UserMinusIcon aria-hidden />
              Retirer l&apos;accès
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setStatutOuvert(true)}>
              <UserPlusIcon aria-hidden />
              Rétablir l&apos;accès
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <OwnerEditDialog
        key={cleEdition}
        ownerId={proprietaire.id}
        open={editionOuverte}
        onOpenChange={setEditionOuverte}
      />

      <ConfirmDialog
        open={statutOuvert}
        onOpenChange={setStatutOuvert}
        titre={
          proprietaire.is_active
            ? `Retirer l'accès de ${nomComplet} ?`
            : `Rétablir l'accès de ${nomComplet} ?`
        }
        description={
          proprietaire.is_active
            ? "Cette personne ne pourra plus se connecter à son espace ni prendre de rendez-vous en ligne. Ses animaux et ses rendez-vous déjà pris sont conservés, et l'accès peut être rétabli à tout moment."
            : "Cette personne pourra de nouveau se connecter à son espace, avec le même mot de passe qu'avant."
        }
        libelleAction={
          proprietaire.is_active ? "Retirer l'accès" : "Rétablir l'accès"
        }
        destructif={proprietaire.is_active}
        enCours={enCours}
        onConfirmer={() => void changerStatut()}
      />
    </>
  );
}
