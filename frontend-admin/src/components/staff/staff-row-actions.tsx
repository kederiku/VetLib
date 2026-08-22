/**
 * Menu d'actions d'une ligne du personnel.
 *
 * Deux gestes : changer le rôle, et couper (ou rétablir) l'accès. Comme pour
 * les cliniques, l'action inverse de l'état courant n'est pas proposée —
 * « Désactiver » n'apparaît pas sur un compte déjà désactivé.
 *
 * Rien ici ne permet de SUPPRIMER un compte, ni d'en changer l'email : le
 * projet est en soft delete intégral, et l'email est l'identifiant de
 * connexion (le changer serait une prise de contrôle en un clic).
 */
"use client";

import {
  MoreHorizontalIcon,
  ShieldIcon,
  UserMinusIcon,
  UserPlusIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StaffRoleDialog } from "@/components/staff/staff-role-dialog";
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
  useActivateAdminStaff,
  useDeactivateAdminStaff,
} from "@/lib/api/generated/admin-staff/admin-staff";
import type { AdminStaffSummary } from "@/lib/api/generated/vetoLibAPI.schemas";
import { messageForApiError } from "@/lib/auth/server-errors";
import { useInvaliderPersonnel } from "@/lib/staff/mutations";

export function StaffRowActions({ membre }: { membre: AdminStaffSummary }) {
  const [roleOuvert, setRoleOuvert] = useState(false);
  const [statutOuvert, setStatutOuvert] = useState(false);
  // Remonte le dialogue de rôle à chaque ouverture : sans cela, le rôle
  // sélectionné puis abandonné au passage précédent serait encore là.
  const [cleRole, setCleRole] = useState(0);
  const invalider = useInvaliderPersonnel();
  const desactivation = useDeactivateAdminStaff<ApiError>();
  const activation = useActivateAdminStaff<ApiError>();

  const enCours = desactivation.isPending || activation.isPending;
  const nomComplet = `${membre.first_name} ${membre.last_name}`;

  const changerStatut = async () => {
    try {
      if (membre.is_active) {
        await desactivation.mutateAsync({ userId: membre.id });
      } else {
        await activation.mutateAsync({ userId: membre.id });
      }
      toast.success(membre.is_active ? "Accès retiré" : "Accès rétabli");
    } catch (erreur) {
      toast.error(messageForApiError(erreur));
    } finally {
      // Invalidation dans les DEUX cas : un refus vient le plus souvent
      // d'un état déjà changé par quelqu'un d'autre, et l'écran doit alors
      // se remettre d'accord avec le serveur.
      await invalider(membre.clinic_id);
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
              setCleRole((valeur) => valeur + 1);
              setRoleOuvert(true);
            }}
          >
            <ShieldIcon aria-hidden />
            Changer le rôle
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {membre.is_active ? (
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

      <StaffRoleDialog
        key={cleRole}
        membre={membre}
        open={roleOuvert}
        onOpenChange={setRoleOuvert}
      />

      <ConfirmDialog
        open={statutOuvert}
        onOpenChange={setStatutOuvert}
        titre={
          membre.is_active
            ? `Retirer l'accès de ${nomComplet} ?`
            : `Rétablir l'accès de ${nomComplet} ?`
        }
        description={
          membre.is_active
            ? "Cette personne ne pourra plus se connecter au portail de sa clinique. Ses rendez-vous et son historique sont conservés, et l'accès peut être rétabli à tout moment."
            : "Cette personne pourra de nouveau se connecter au portail de sa clinique, avec le même mot de passe qu'avant."
        }
        libelleAction={
          membre.is_active ? "Retirer l'accès" : "Rétablir l'accès"
        }
        destructif={membre.is_active}
        enCours={enCours}
        onConfirmer={() => void changerStatut()}
      />
    </>
  );
}
