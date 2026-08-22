/**
 * Dialogue « ajouter un membre » sur la fiche d'une clinique.
 *
 * Le rôle proposé par défaut est **Gérant** : c'est le besoin qui amène ici.
 * Une clinique se crée avec son premier gérant, et on revient sur cette
 * fiche quand il en faut un second — un ASV recruté se crée depuis le
 * portail de la clinique, par le gérant, pas depuis cette console.
 *
 * Comme à la création d'une clinique, le mot de passe est généré par le
 * backend et remis une seule fois : le dialogue bascule sur
 * `TemporaryPasswordPanel` et refuse de se fermer autrement que par son
 * bouton dédié.
 */
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { TemporaryPasswordPanel } from "@/components/staff/temporary-password-panel";
import { Alert, AlertTitle } from "@/components/ui/alert";
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { ApiError } from "@/lib/api/errors";
import { useCreateAdminClinicStaff } from "@/lib/api/generated/admin-clinics/admin-clinics";
import type {
  AdminStaffCreatedResponse,
  Role,
} from "@/lib/api/generated/vetoLibAPI.schemas";
import { applyServerErrors } from "@/lib/auth/server-errors";
import { useInvaliderPersonnel } from "@/lib/staff/mutations";
import { ROLE_OPTIONS } from "@/lib/staff/roles";
import { staffCreateSchema, type StaffCreateValues } from "@/lib/staff/schemas";

const CHAMPS_CONNUS = ["email", "first_name", "last_name", "role"] as const;

export function StaffCreateDialog({
  clinicId,
  clinicName,
  open,
  onOpenChange,
}: {
  clinicId: string;
  clinicName: string;
  open: boolean;
  onOpenChange: (ouvert: boolean) => void;
}) {
  const invalider = useInvaliderPersonnel();
  const mutation = useCreateAdminClinicStaff<ApiError>();
  const [remise, setRemise] = useState<AdminStaffCreatedResponse | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<StaffCreateValues>({
    resolver: zodResolver(staffCreateSchema),
    defaultValues: {
      email: "",
      first_name: "",
      last_name: "",
      role: "manager",
    },
  });

  const soumettre = handleSubmit(async (valeurs) => {
    try {
      const reponse = await mutation.mutateAsync({ clinicId, data: valeurs });
      await invalider(clinicId);
      // Narrowing pour TypeScript : le mutator a deja jete sur tout statut
      // >= 400, on ne peut pas etre ailleurs qu'en 201 ici.
      if (reponse.status !== 201) return;
      setRemise(reponse.data);
    } catch (erreur) {
      applyServerErrors(erreur, setError, CHAMPS_CONNUS);
    }
  });

  const terminer = () => {
    setRemise(null);
    onOpenChange(false);
    toast.success("Compte créé");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(ouvert) => {
        // Tant que le mot de passe n'a pas ete remis, seul le bouton dedie
        // ferme le dialogue : un clic a cote perdrait le secret.
        if (remise !== null) return;
        onOpenChange(ouvert);
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        {remise !== null ? (
          <>
            <DialogHeader>
              <DialogTitle>Compte créé</DialogTitle>
              <DialogDescription>
                Transmettez ces identifiants par un canal sûr.
              </DialogDescription>
            </DialogHeader>

            <TemporaryPasswordPanel compte={remise} prefixeId="membre" />

            <DialogFooter>
              <Button onClick={terminer}>J&apos;ai noté le mot de passe</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Ajouter un membre</DialogTitle>
              <DialogDescription>
                Un nouveau compte pour {clinicName}.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={soumettre} noValidate>
              <FieldGroup>
                {errors.root?.server && (
                  <Alert variant="destructive">
                    <AlertTitle>{errors.root.server.message}</AlertTitle>
                  </Alert>
                )}

                <Field data-invalid={!!errors.email}>
                  <FieldLabel htmlFor="membre-email">Email</FieldLabel>
                  <Input
                    id="membre-email"
                    type="email"
                    aria-invalid={!!errors.email}
                    {...register("email")}
                  />
                  <FieldDescription>
                    Son identifiant de connexion au portail de la clinique.
                  </FieldDescription>
                  <FieldError errors={[errors.email]} />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field data-invalid={!!errors.first_name}>
                    <FieldLabel htmlFor="membre-prenom">Prénom</FieldLabel>
                    <Input
                      id="membre-prenom"
                      aria-invalid={!!errors.first_name}
                      {...register("first_name")}
                    />
                    <FieldError errors={[errors.first_name]} />
                  </Field>
                  <Field data-invalid={!!errors.last_name}>
                    <FieldLabel htmlFor="membre-nom">Nom</FieldLabel>
                    <Input
                      id="membre-nom"
                      aria-invalid={!!errors.last_name}
                      {...register("last_name")}
                    />
                    <FieldError errors={[errors.last_name]} />
                  </Field>
                </div>

                <Field data-invalid={!!errors.role}>
                  <FieldLabel htmlFor="membre-role">Rôle</FieldLabel>
                  {/* Controller : le Select de Base UI est controle, et son
                      onValueChange est type `unknown`. */}
                  <Controller
                    control={control}
                    name="role"
                    render={({ field }) => (
                      <Select
                        items={ROLE_OPTIONS}
                        value={field.value}
                        onValueChange={(valeur) => {
                          if (typeof valeur === "string")
                            field.onChange(valeur as Role);
                        }}
                      >
                        <SelectTrigger id="membre-role">
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
                    )}
                  />
                  <FieldDescription>
                    Seul un gérant peut administrer la clinique depuis son
                    propre portail.
                  </FieldDescription>
                  <FieldError errors={[errors.role]} />
                </Field>

                <DialogFooter>
                  <DialogClose
                    render={<Button variant="outline" type="button" />}
                  >
                    Annuler
                  </DialogClose>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Spinner data-icon="inline-start" />}
                    Créer le compte
                  </Button>
                </DialogFooter>
              </FieldGroup>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
