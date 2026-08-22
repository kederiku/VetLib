/**
 * Dialogue « changer le rôle » d'un membre du personnel.
 *
 * Une `FieldDescription` y dit une vérité désagréable mais nécessaire : le
 * changement n'est pas instantané pour la personne concernée. Le portail
 * clinique lit les permissions dans le jeton d'accès, valable 15 minutes ;
 * le nouveau rôle s'applique donc au plus tard au prochain rafraîchissement
 * de sa session. Le taire produirait un ticket de support (« j'ai changé son
 * rôle et il ne voit toujours rien ») par semaine.
 *
 * Le backend refuse de rétrograder le DERNIER gérant actif d'une clinique
 * (`identity.last_manager`, 409) : le message remonte tel quel en bandeau.
 */
"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertTitle } from "@/components/ui/alert";
import type { ApiError } from "@/lib/api/errors";
import { useChangeAdminStaffRole } from "@/lib/api/generated/admin-staff/admin-staff";
import type {
  AdminStaffSummary,
  Role,
} from "@/lib/api/generated/vetoLibAPI.schemas";
import { messageForApiError } from "@/lib/auth/server-errors";
import { useInvaliderPersonnel } from "@/lib/staff/mutations";
import { ROLE_OPTIONS } from "@/lib/staff/roles";

export function StaffRoleDialog({
  membre,
  open,
  onOpenChange,
}: {
  membre: AdminStaffSummary;
  open: boolean;
  onOpenChange: (ouvert: boolean) => void;
}) {
  const invalider = useInvaliderPersonnel();
  const mutation = useChangeAdminStaffRole<ApiError>();
  const [role, setRole] = useState<Role>(membre.role);
  // Erreur affichée dans le dialogue et non en toast : l'utilisateur doit
  // AGIR (choisir un autre rôle, ou renoncer), et le dialogue reste ouvert.
  const [erreur, setErreur] = useState<string | null>(null);

  const enregistrer = async () => {
    setErreur(null);
    try {
      await mutation.mutateAsync({ userId: membre.id, data: { role } });
      await invalider(membre.clinic_id);
      onOpenChange(false);
      toast.success("Rôle modifié");
    } catch (exception) {
      setErreur(messageForApiError(exception));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Changer le rôle</DialogTitle>
          <DialogDescription>
            {membre.first_name} {membre.last_name} — {membre.clinic_name}
          </DialogDescription>
        </DialogHeader>

        {erreur !== null && (
          <Alert variant="destructive">
            <AlertTitle>{erreur}</AlertTitle>
          </Alert>
        )}

        <Field>
          <FieldLabel htmlFor="role-membre">Rôle</FieldLabel>
          <Select
            items={ROLE_OPTIONS}
            value={role}
            onValueChange={(valeur) => {
              if (typeof valeur === "string") setRole(valeur as Role);
            }}
          >
            <SelectTrigger id="role-membre">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            Le portail clinique lit les permissions dans le jeton de session :
            le nouveau rôle s&apos;appliquera pour cette personne dans un délai
            maximum de 15 minutes.
          </FieldDescription>
        </Field>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>
            Annuler
          </DialogClose>
          <Button
            type="button"
            disabled={mutation.isPending || role === membre.role}
            onClick={() => void enregistrer()}
          >
            {mutation.isPending && <Spinner data-icon="inline-start" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
