/**
 * Dialog créer/éditer un praticien.
 *
 * Même patron que le dialog des types de rendez-vous : `resource ===
 * null` = création (POST), sinon édition (PUT) avec le Switch actif.
 * Le rattachement à un compte utilisateur (user_id) n'est pas édité
 * ici : à l'update, on RENVOIE la valeur existante telle quelle — le
 * PUT étant un remplacement complet, l'omettre délierait le compte.
 */
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";

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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { ApiError } from "@/lib/api/errors";
import {
  getListResourcesQueryKey,
  useCreateResource,
  useUpdateResource,
} from "@/lib/api/generated/scheduling/scheduling";
import type { ResourceResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import { applyServerErrors } from "@/lib/auth/server-errors";
import {
  practitionerSchema,
  type PractitionerFormValues,
} from "@/lib/scheduling/schemas";

const KNOWN_FIELDS = ["name"] as const;

type PractitionerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = création ; une ressource = édition de celle-ci. */
  resource: ResourceResponse | null;
};

export function PractitionerDialog({
  open,
  onOpenChange,
  resource,
}: PractitionerDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = resource !== null;

  const createMutation = useCreateResource<ApiError>();
  const updateMutation = useUpdateResource<ApiError>();

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PractitionerFormValues>({
    resolver: zodResolver(practitionerSchema),
    defaultValues: isEdit
      ? { name: resource.name, active: resource.active }
      : { name: "", active: true },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          resourceId: resource.id,
          data: {
            name: values.name,
            active: values.active,
            // PUT = remplacement complet : on repasse le user_id existant
            // pour ne pas délier le compte utilisateur du praticien.
            user_id: resource.user_id,
          },
        });
      } else {
        await createMutation.mutateAsync({ data: { name: values.name } });
      }
      // Rafraîchit la liste de l'onglet, le filtre de l'agenda et les
      // Selects (horaires, nouveau rendez-vous) : même query partout.
      await queryClient.invalidateQueries({
        queryKey: getListResourcesQueryKey(),
      });
      onOpenChange(false);
    } catch (error) {
      applyServerErrors(error, setError, KNOWN_FIELDS);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Modifier le praticien" : "Nouveau praticien"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Nom affiché et disponibilité de ce praticien."
              : "Un praticien dont l'agenda recevra des rendez-vous."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            {errors.root?.server && (
              <Alert variant="destructive">
                <AlertTitle>{errors.root.server.message}</AlertTitle>
              </Alert>
            )}

            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="practitioner-name">Nom</FieldLabel>
              <Input
                id="practitioner-name"
                type="text"
                placeholder="Dr Martin"
                aria-invalid={!!errors.name}
                {...register("name")}
              />
              <FieldError errors={[errors.name]} />
            </Field>

            {/* Switch actif : ÉDITION seulement (un praticien naît
                actif). Composant Base UI contrôlé -> Controller. */}
            {isEdit && (
              <Field orientation="horizontal">
                <Controller
                  control={control}
                  name="active"
                  render={({ field }) => (
                    <Switch
                      id="practitioner-active"
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked)}
                    />
                  )}
                />
                <FieldLabel
                  htmlFor="practitioner-active"
                  className="font-normal"
                >
                  Praticien actif (agenda ouvert aux rendez-vous)
                </FieldLabel>
              </Field>
            )}

            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Annuler
              </DialogClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Spinner data-icon="inline-start" />}
                {isEdit ? "Enregistrer" : "Créer le praticien"}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
