/**
 * Dialog créer/éditer un type de rendez-vous.
 *
 * UN seul dialog pour les deux modes : `type === null` = création
 * (POST, sans le champ actif), un type = édition (PUT, avec le Switch
 * actif). Le parent le remonte via `key={type?.id ?? "new"}` pour que
 * les defaultValues repartent de la bonne cible. La durée est un Select
 * de multiples de 5 (5 à 120 min) : Base UI manipule des CHAÎNES, le
 * Controller convertit vers le number attendu par le schéma zod.
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { ApiError } from "@/lib/api/errors";
import {
  getListAppointmentTypesQueryKey,
  useCreateAppointmentType,
  useUpdateAppointmentType,
} from "@/lib/api/generated/scheduling/scheduling";
import type { AppointmentTypeResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import { applyServerErrors } from "@/lib/auth/server-errors";
import {
  appointmentTypeSchema,
  type AppointmentTypeFormValues,
} from "@/lib/scheduling/schemas";

const KNOWN_FIELDS = ["name", "duration_minutes"] as const;

// Durées proposées : 5 à 120 min par pas de 5. Le backend accepte
// jusqu'à 480, mais l'UI borne aux durées réalistes d'une consultation.
const DURATION_OPTIONS = Array.from({ length: 24 }, (_, i) => (i + 1) * 5);

type AppointmentTypeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = création ; un type = édition de ce type. */
  type: AppointmentTypeResponse | null;
};

export function AppointmentTypeDialog({
  open,
  onOpenChange,
  type,
}: AppointmentTypeDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = type !== null;

  const createMutation = useCreateAppointmentType<ApiError>();
  const updateMutation = useUpdateAppointmentType<ApiError>();

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AppointmentTypeFormValues>({
    resolver: zodResolver(appointmentTypeSchema),
    // defaultValues suffisent (pas de values:) : la cible ne change
    // jamais pendant la vie du composant, le parent le remonte via key.
    defaultValues: isEdit
      ? {
          name: type.name,
          duration_minutes: type.duration_minutes,
          active: type.active,
        }
      : { name: "", duration_minutes: 30, active: true },
  });

  // Défensif : un type existant peut avoir une durée hors de la liste
  // (posée avant que l'UI ne borne à 120) ; on l'ajoute aux options pour
  // l'afficher et ne pas l'écraser silencieusement.
  const durations =
    isEdit && !DURATION_OPTIONS.includes(type.duration_minutes)
      ? [...DURATION_OPTIONS, type.duration_minutes].sort((a, b) => a - b)
      : DURATION_OPTIONS;
  const durationItems = durations.map((minutes) => ({
    value: String(minutes),
    label: `${minutes} min`,
  }));

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          appointmentTypeId: type.id,
          data: {
            name: values.name,
            duration_minutes: values.duration_minutes,
            active: values.active,
          },
        });
      } else {
        // Pas de champ active à la création : le backend crée actif.
        await createMutation.mutateAsync({
          data: {
            name: values.name,
            duration_minutes: values.duration_minutes,
          },
        });
      }
      // La liste de l'onglet ET les Selects du dialog de rendez-vous
      // consomment cette query : une seule invalidation les rafraîchit.
      await queryClient.invalidateQueries({
        queryKey: getListAppointmentTypesQueryKey(),
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
            {isEdit ? "Modifier le type" : "Nouveau type de rendez-vous"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Nom, durée et disponibilité de ce motif."
              : "Un motif proposé à la prise de rendez-vous."}
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
              <FieldLabel htmlFor="type-name">Nom</FieldLabel>
              <Input
                id="type-name"
                type="text"
                placeholder="Consultation générale"
                aria-invalid={!!errors.name}
                {...register("name")}
              />
              <FieldError errors={[errors.name]} />
            </Field>

            <Field data-invalid={!!errors.duration_minutes}>
              <FieldLabel>Durée</FieldLabel>
              {/* Select Base UI (chaînes) <-> schéma zod (number) : le
                  Controller fait la conversion dans les deux sens. */}
              <Controller
                control={control}
                name="duration_minutes"
                render={({ field }) => (
                  <Select
                    items={durationItems}
                    value={String(field.value)}
                    onValueChange={(value) => {
                      if (typeof value === "string") {
                        field.onChange(Number(value));
                      }
                    }}
                  >
                    <SelectTrigger
                      className="w-40"
                      aria-invalid={!!errors.duration_minutes}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {durationItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.duration_minutes]} />
            </Field>

            {/* Switch actif : ÉDITION seulement (un nouveau type naît
                actif). Composant Base UI contrôlé -> Controller. */}
            {isEdit && (
              <Field orientation="horizontal">
                <Controller
                  control={control}
                  name="active"
                  render={({ field }) => (
                    <Switch
                      id="type-active"
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked)}
                    />
                  )}
                />
                <FieldLabel htmlFor="type-active" className="font-normal">
                  Type actif (proposé à la prise de rendez-vous)
                </FieldLabel>
              </Field>
            )}

            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Annuler
              </DialogClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Spinner data-icon="inline-start" />}
                {isEdit ? "Enregistrer" : "Créer le type"}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
