/**
 * Menu d'actions d'une ligne de la liste des cliniques.
 *
 * Autonome : il porte ses propres dialogues et ses propres mutations. La
 * liste n'a donc pas à gérer un état « quelle ligne est en cours
 * d'édition », qui est la source classique des bugs de dialogue rouvert sur
 * la mauvaise cible.
 *
 * Les actions proposées dépendent du statut : on ne montre jamais
 * « Suspendre » sur une clinique déjà suspendue. Une action désactivée
 * qu'on ne peut pas exécuter est du bruit ; une action absente est une
 * information.
 */
"use client";

import {
  BanIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RotateCcwIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { ClinicEditDialog } from "@/components/clinics/clinic-edit-dialog";
import { ClinicSuspendDialog } from "@/components/clinics/clinic-suspend-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ApiError } from "@/lib/api/errors";
import { useReactivateAdminClinic } from "@/lib/api/generated/admin-clinics/admin-clinics";
import type { AdminClinicSummary } from "@/lib/api/generated/vetoLibAPI.schemas";
import { messageForApiError } from "@/lib/auth/server-errors";
import { useInvaliderCliniques } from "@/lib/clinics/mutations";

export function ClinicRowActions({
  clinique,
}: {
  clinique: AdminClinicSummary;
}) {
  const [editionOuverte, setEditionOuverte] = useState(false);
  const [suspensionOuverte, setSuspensionOuverte] = useState(false);
  // Compteur remonté à chaque ouverture : il sert de `key` au dialogue
  // d'édition, qui est donc remonté à neuf. Sans cela, rouvrir sur la MÊME
  // clinique conserverait la saisie abandonnée et l'erreur serveur du
  // passage précédent.
  const [cleEdition, setCleEdition] = useState(0);
  const invalider = useInvaliderCliniques();
  const reactivation = useReactivateAdminClinic<ApiError>();

  const reactiver = async () => {
    try {
      await reactivation.mutateAsync({ clinicId: clinique.id });
      await invalider(clinique.id);
      toast.success("Accès rétabli");
    } catch (erreur) {
      toast.error(messageForApiError(erreur));
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
              aria-label={`Actions pour ${clinique.name}`}
            />
          }
        >
          <MoreHorizontalIcon aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            render={<Link href={`/cliniques/${clinique.id}`} />}
          >
            Ouvrir la fiche
          </DropdownMenuItem>
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
          {clinique.is_active ? (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setSuspensionOuverte(true)}
            >
              <BanIcon aria-hidden />
              Suspendre l&apos;accès
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              disabled={reactivation.isPending}
              onClick={() => void reactiver()}
            >
              <RotateCcwIcon aria-hidden />
              Réactiver l&apos;accès
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ClinicEditDialog
        key={cleEdition}
        clinicId={clinique.id}
        open={editionOuverte}
        onOpenChange={setEditionOuverte}
      />
      <ClinicSuspendDialog
        clinicId={clinique.id}
        nom={clinique.name}
        effectif={clinique.staff_count}
        open={suspensionOuverte}
        onOpenChange={setSuspensionOuverte}
      />
    </>
  );
}
