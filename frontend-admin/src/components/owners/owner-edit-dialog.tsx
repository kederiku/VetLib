/**
 * Dialogue d'édition de la fiche d'un propriétaire.
 *
 * Deux choses n'y sont PAS modifiables, et c'est le coeur du sujet :
 *
 * - l'EMAIL, identifiant de connexion du client (affiché en lecture seule
 *   avec l'explication, plutôt que masqué : un champ absent passerait pour
 *   un oubli) ;
 * - le MOT DE PASSE, qui n'apparaît nulle part. Permettre à un exploitant de
 *   le changer reviendrait à lui donner le moyen d'entrer dans le compte
 *   d'un client — et de consulter ses animaux et ses rendez-vous.
 *
 * PIÈGE de l'API, à ne pas perdre : `notification_preferences` a une VALEUR
 * PAR DÉFAUT côté backend. L'omettre ne veut pas dire « ne change pas », mais
 * « remets les valeurs par défaut ». Corriger un numéro de téléphone
 * réinitialiserait donc en silence les choix de notification du client. On
 * renvoie ce que la fiche a rendu, tel quel — et c'est aussi pourquoi le
 * formulaire ne s'ouvre qu'une fois la fiche chargée.
 */
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { AddressFields } from "@/components/shared/address-fields";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { ApiError } from "@/lib/api/errors";
import {
  useGetAdminOwner,
  useUpdateAdminOwner,
} from "@/lib/api/generated/admin-owners/admin-owners";
import type { AdminOwnerResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import { applyServerErrors } from "@/lib/auth/server-errors";
import { useInvaliderProprietaires } from "@/lib/owners/mutations";
import { ownerEditSchema, type OwnerEditValues } from "@/lib/owners/schemas";

const CHAMPS_CONNUS = ["first_name", "last_name", "phone"] as const;

export function OwnerEditDialog({
  ownerId,
  open,
  onOpenChange,
}: {
  ownerId: string;
  open: boolean;
  onOpenChange: (ouvert: boolean) => void;
}) {
  const invalider = useInvaliderProprietaires();
  // enabled: open -- sans cela, une page de vingt lignes déclencherait vingt
  // requêtes de fiche au montage, pour des dialogues jamais ouverts.
  const fiche = useGetAdminOwner<AdminOwnerResponse | undefined, ApiError>(
    ownerId,
    {
      query: {
        enabled: open,
        select: (reponse) =>
          reponse.status === 200 ? reponse.data : undefined,
      },
    },
  );
  const mutation = useUpdateAdminOwner<ApiError>();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<OwnerEditValues>({
    resolver: zodResolver(ownerEditSchema),
    values: fiche.data
      ? {
          first_name: fiche.data.first_name,
          last_name: fiche.data.last_name,
          phone: fiche.data.phone ?? "",
          address: {
            line1: fiche.data.address?.line1 ?? "",
            line2: fiche.data.address?.line2 ?? "",
            postal_code: fiche.data.address?.postal_code ?? "",
            city: fiche.data.address?.city ?? "",
          },
        }
      : undefined,
  });

  const soumettre = handleSubmit(async (valeurs) => {
    try {
      await mutation.mutateAsync({
        ownerId,
        data: {
          first_name: valeurs.first_name,
          last_name: valeurs.last_name,
          phone: valeurs.phone === "" ? null : (valeurs.phone ?? null),
          address:
            valeurs.address.line1 === "" || valeurs.address.line1 === undefined
              ? null
              : {
                  line1: valeurs.address.line1,
                  line2:
                    valeurs.address.line2 === "" ? null : valeurs.address.line2,
                  postal_code: valeurs.address.postal_code ?? "",
                  city: valeurs.address.city ?? "",
                  country: "FR",
                },
          // Renvoyées telles quelles : voir la docstring du module.
          notification_preferences: fiche.data?.notification_preferences ?? {},
        },
      });
      await invalider(ownerId);
      toast.success("Fiche mise à jour");
      onOpenChange(false);
    } catch (erreur) {
      applyServerErrors(erreur, setError, CHAMPS_CONNUS);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifier la fiche</DialogTitle>
          <DialogDescription>Coordonnées du propriétaire.</DialogDescription>
        </DialogHeader>

        {fiche.isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <form onSubmit={soumettre} noValidate>
            <FieldGroup>
              {errors.root?.server && (
                <Alert variant="destructive">
                  <AlertTitle>{errors.root.server.message}</AlertTitle>
                </Alert>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={!!errors.first_name}>
                  <FieldLabel htmlFor="owner-prenom">Prénom</FieldLabel>
                  <Input
                    id="owner-prenom"
                    aria-invalid={!!errors.first_name}
                    {...register("first_name")}
                  />
                  <FieldError errors={[errors.first_name]} />
                </Field>
                <Field data-invalid={!!errors.last_name}>
                  <FieldLabel htmlFor="owner-nom">Nom</FieldLabel>
                  <Input
                    id="owner-nom"
                    aria-invalid={!!errors.last_name}
                    {...register("last_name")}
                  />
                  <FieldError errors={[errors.last_name]} />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="owner-email">Email</FieldLabel>
                <Input
                  id="owner-email"
                  value={fiche.data?.email ?? ""}
                  disabled
                  readOnly
                />
                <FieldDescription>
                  C&apos;est l&apos;identifiant de connexion du client : il ne
                  peut pas être modifié depuis la console.
                </FieldDescription>
              </Field>

              <Field data-invalid={!!errors.phone}>
                <FieldLabel htmlFor="owner-telephone">Téléphone</FieldLabel>
                <Input
                  id="owner-telephone"
                  autoComplete="tel"
                  aria-invalid={!!errors.phone}
                  {...register("phone")}
                />
                <FieldError errors={[errors.phone]} />
              </Field>

              <AddressFields
                register={register}
                errors={errors}
                prefixeId="owner"
              />

              <DialogFooter>
                <DialogClose
                  render={<Button variant="outline" type="button" />}
                >
                  Annuler
                </DialogClose>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Spinner data-icon="inline-start" />}
                  Enregistrer
                </Button>
              </DialogFooter>
            </FieldGroup>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
