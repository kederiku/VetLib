/**
 * Dialogue d'édition de la fiche d'une clinique.
 *
 * Il CHARGE la fiche complète à l'ouverture plutôt que de se contenter de la
 * ligne de liste : celle-ci ne porte que la ville, pas l'adresse entière ni
 * le fuseau. Éditer depuis une donnée partielle écraserait les champs
 * absents.
 *
 * Aucun champ email, comme côté backend : c'est l'identifiant d'inscription
 * de la clinique, et un administrateur qui le changerait d'un clic ferait
 * une prise de contrôle, pas une correction de fiche. Le champ est affiché
 * en lecture seule, avec l'explication — le masquer laisserait croire à un
 * oubli.
 */
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { AddressFields } from "@/components/shared/address-fields";
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
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { ApiError } from "@/lib/api/errors";
import {
  useGetAdminClinic,
  useUpdateAdminClinic,
} from "@/lib/api/generated/admin-clinics/admin-clinics";
import type { AdminClinicResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import { applyServerErrors } from "@/lib/auth/server-errors";
import { useInvaliderCliniques } from "@/lib/clinics/mutations";
import { clinicEditSchema, type ClinicEditValues } from "@/lib/clinics/schemas";

const CHAMPS_CONNUS = ["name", "phone", "timezone"] as const;

export function ClinicEditDialog({
  clinicId,
  open,
  onOpenChange,
}: {
  clinicId: string;
  open: boolean;
  onOpenChange: (ouvert: boolean) => void;
}) {
  const invalider = useInvaliderCliniques();
  // enabled: open -- on ne charge la fiche que si le dialogue est ouvert.
  // Sans cela, une liste de vingt lignes déclencherait vingt requêtes de
  // fiche au montage, pour des dialogues que personne n'a ouverts.
  const fiche = useGetAdminClinic<AdminClinicResponse | undefined, ApiError>(
    clinicId,
    {
      query: {
        enabled: open,
        // L'union generee inclut la variante 422 ; a l'execution le mutator
        // a deja jete sur tout statut >= 400, on est donc forcement en 200
        // ici -- le narrowing est pour TypeScript, pas pour le runtime.
        select: (res) => (res.status === 200 ? res.data : undefined),
      },
    },
  );
  const mutation = useUpdateAdminClinic<ApiError>();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ClinicEditValues>({
    resolver: zodResolver(clinicEditSchema),
    // values (et non defaultValues) : le formulaire se remplit dès que la
    // requête aboutit, sans effet de synchronisation à écrire à la main.
    values: fiche.data
      ? {
          name: fiche.data.name,
          phone: fiche.data.phone ?? "",
          timezone: fiche.data.timezone,
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
        clinicId,
        data: {
          name: valeurs.name,
          phone: valeurs.phone === "" ? null : (valeurs.phone ?? null),
          timezone: valeurs.timezone,
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
        },
      });
      await invalider(clinicId);
      toast.success("Fiche mise à jour");
      onOpenChange(false);
    } catch (erreur) {
      // Inline et non toast : l'utilisateur doit AGIR (corriger un champ),
      // et le dialogue reste donc ouvert avec sa saisie.
      applyServerErrors(erreur, setError, CHAMPS_CONNUS);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifier la fiche</DialogTitle>
          <DialogDescription>
            Coordonnées et réglages de la clinique.
          </DialogDescription>
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

              <Field data-invalid={!!errors.name}>
                <FieldLabel htmlFor="edit-name">Nom de la clinique</FieldLabel>
                <Input
                  id="edit-name"
                  aria-invalid={!!errors.name}
                  {...register("name")}
                />
                <FieldError errors={[errors.name]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="edit-email">Email de contact</FieldLabel>
                <Input
                  id="edit-email"
                  value={fiche.data?.email ?? ""}
                  disabled
                  readOnly
                />
                <FieldDescription>
                  L&apos;adresse d&apos;inscription ne peut pas être modifiée
                  depuis la console.
                </FieldDescription>
              </Field>

              <Field data-invalid={!!errors.phone}>
                <FieldLabel htmlFor="edit-phone">Téléphone</FieldLabel>
                <Input
                  id="edit-phone"
                  autoComplete="tel"
                  aria-invalid={!!errors.phone}
                  {...register("phone")}
                />
                <FieldError errors={[errors.phone]} />
              </Field>

              <AddressFields
                register={register}
                errors={errors}
                prefixeId="edit"
              />

              <Field data-invalid={!!errors.timezone}>
                <FieldLabel htmlFor="edit-timezone">Fuseau horaire</FieldLabel>
                <Input
                  id="edit-timezone"
                  aria-invalid={!!errors.timezone}
                  {...register("timezone")}
                />
                <FieldDescription>
                  Identifiant IANA, par exemple <code>Europe/Paris</code>. Les
                  horaires d&apos;ouverture s&apos;interprètent dans ce fuseau.
                </FieldDescription>
                <FieldError errors={[errors.timezone]} />
              </Field>

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
