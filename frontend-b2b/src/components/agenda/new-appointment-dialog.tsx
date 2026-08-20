/**
 * Dialog "Nouveau rendez-vous" : création par le staff depuis l'agenda.
 *
 * Formulaire react-hook-form + zod (newAppointmentSchema), sur le
 * pattern canonique du projet (Controller pour les composants Base UI
 * contrôlés, mutateAsync + applyServerErrors). Deux partis pris :
 * - l'heure est saisie LIBREMENT (input time natif), pas choisie dans
 *   une liste de créneaux : le staff peut forcer un horaire hors grille
 *   (urgence, arrangement) ; la contrainte d'EXCLUSION PostgreSQL
 *   protège du chevauchement et son 409 s'affiche en bandeau ;
 * - l'écran cible le client de PASSAGE (guest_name requis) ; le
 *   rattachement à un compte propriétaire viendra avec l'écran patients.
 * Le parent remonte le dialog via `key` à chaque ouverture : le
 * formulaire repart vierge sans logique de reset manuelle.
 */
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { fr } from "react-day-picker/locale";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { ApiError } from "@/lib/api/errors";
import { useCreateAppointment } from "@/lib/api/generated/scheduling/scheduling";
import type {
  AppointmentTypeResponse,
  ResourceResponse,
} from "@/lib/api/generated/vetoLibAPI.schemas";
import { applyServerErrors } from "@/lib/auth/server-errors";
import { formatDayLong } from "@/lib/date/format";
import {
  newAppointmentSchema,
  type NewAppointmentFormValues,
} from "@/lib/scheduling/schemas";
import { invalidateAgenda } from "@/lib/scheduling/invalidate-agenda";

// Champs que CE formulaire affiche : une erreur 422 sur un autre champ
// (starts_at recombiné, évolution d'API) part dans le bandeau global.
const KNOWN_FIELDS = [
  "resource_id",
  "appointment_type_id",
  "guest_name",
  "guest_pet_name",
  "reason",
] as const;

type NewAppointmentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Praticiens actifs proposés dans le Select. */
  resources: ResourceResponse[];
  /** Types de rendez-vous actifs proposés dans le Select. */
  appointmentTypes: AppointmentTypeResponse[];
};

export function NewAppointmentDialog({
  open,
  onOpenChange,
  resources,
  appointmentTypes,
}: NewAppointmentDialogProps) {
  const queryClient = useQueryClient();
  const createMutation = useCreateAppointment<ApiError>();

  // Ouverture du Popover calendrier : contrôlée pour pouvoir le fermer
  // dès qu'une date est choisie (Base UI ne le fait pas tout seul).
  const [dateOpen, setDateOpen] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<NewAppointmentFormValues>({
    resolver: zodResolver(newAppointmentSchema),
    defaultValues: {
      resource_id: "",
      appointment_type_id: "",
      date: undefined,
      time: "",
      guest_name: "",
      guest_pet_name: "",
      reason: "",
    },
  });

  // items : Base UI affiche ces LIBELLÉS dans les triggers des Select,
  // au lieu des valeurs brutes (UUID).
  const resourceItems = resources.map((resource) => ({
    value: resource.id,
    label: resource.name,
  }));
  const typeItems = appointmentTypes.map((type) => ({
    value: type.id,
    label: type.name,
  }));

  // Minuit aujourd'hui : borne basse du calendrier (pas de RDV créés
  // dans le passé depuis cet écran).
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const onSubmit = handleSubmit(async (values) => {
    // Recombinaison date + heure en Date LOCALE du poste, convertie en
    // ISO UTC pour l'API. Poste clinique supposé en Europe/Paris (comme
    // CLINIC_TIME_ZONE) : c'est le fuseau dans lequel le staff pense
    // "14:30". Le backend re-projettera dans la timezone de la clinique.
    const [hours, minutes] = values.time.split(":").map(Number);
    const startsAt = new Date(values.date);
    startsAt.setHours(hours, minutes, 0, 0);

    try {
      await createMutation.mutateAsync({
        data: {
          resource_id: values.resource_id,
          appointment_type_id: values.appointment_type_id,
          // ends_at n'est PAS envoyé : le backend le dérive de la durée
          // du type de rendez-vous.
          starts_at: startsAt.toISOString(),
          guest_name: values.guest_name,
          // "" -> null : champs nullables côté backend.
          guest_pet_name: values.guest_pet_name || null,
          reason: values.reason || null,
        },
      });
      // Toutes les vues agenda (semaine, jour, carte "À confirmer")
      // refetchent, puis on ferme : le nouveau RDV apparaît à sa place.
      await invalidateAgenda(queryClient);
      onOpenChange(false);
    } catch (error) {
      // 409 slot_already_booked et consorts -> bandeau root du dialog.
      applyServerErrors(error, setError, KNOWN_FIELDS);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouveau rendez-vous</DialogTitle>
          <DialogDescription>
            Créez un rendez-vous pour un client de passage.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            {errors.root?.server && (
              <Alert variant="destructive">
                <AlertTitle>{errors.root.server.message}</AlertTitle>
              </Alert>
            )}

            <div className="grid gap-6 sm:grid-cols-2">
              {/* Select Base UI = composant contrôlé : Controller relie
                  value/onValueChange à react-hook-form. Base UI utilise
                  null pour "rien de sélectionné", le formulaire "". */}
              <Field data-invalid={!!errors.resource_id}>
                <FieldLabel>Praticien</FieldLabel>
                <Controller
                  control={control}
                  name="resource_id"
                  render={({ field }) => (
                    <Select
                      items={resourceItems}
                      value={field.value === "" ? null : field.value}
                      onValueChange={(value) => field.onChange(value ?? "")}
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-invalid={!!errors.resource_id}
                      >
                        <SelectValue placeholder="Choisir un praticien" />
                      </SelectTrigger>
                      <SelectContent>
                        {resourceItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.resource_id]} />
              </Field>

              <Field data-invalid={!!errors.appointment_type_id}>
                <FieldLabel>Type de rendez-vous</FieldLabel>
                <Controller
                  control={control}
                  name="appointment_type_id"
                  render={({ field }) => (
                    <Select
                      items={typeItems}
                      value={field.value === "" ? null : field.value}
                      onValueChange={(value) => field.onChange(value ?? "")}
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-invalid={!!errors.appointment_type_id}
                      >
                        <SelectValue placeholder="Choisir un type" />
                      </SelectTrigger>
                      <SelectContent>
                        {appointmentTypes.map((type) => (
                          <SelectItem key={type.id} value={type.id}>
                            {type.name}
                            {/* Durée en description : elle détermine le
                                ends_at dérivé par le backend. */}
                            <span className="text-xs text-muted-foreground">
                              {type.duration_minutes} min
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.appointment_type_id]} />
              </Field>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <Field data-invalid={!!errors.date}>
                <FieldLabel>Date</FieldLabel>
                <Controller
                  control={control}
                  name="date"
                  render={({ field }) => (
                    <Popover open={dateOpen} onOpenChange={setDateOpen}>
                      <PopoverTrigger
                        render={
                          <Button
                            variant="outline"
                            className="w-full justify-start font-normal"
                            aria-invalid={!!errors.date}
                          />
                        }
                      >
                        <CalendarIcon data-icon="inline-start" />
                        <span className="first-letter:uppercase">
                          {field.value !== undefined
                            ? formatDayLong(field.value)
                            : "Choisir une date"}
                        </span>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          locale={fr}
                          selected={field.value}
                          onSelect={(date) => {
                            field.onChange(date);
                            setDateOpen(false);
                          }}
                          disabled={{ before: startOfToday }}
                        />
                      </PopoverContent>
                    </Popover>
                  )}
                />
                <FieldError errors={[errors.date]} />
              </Field>

              <Field data-invalid={!!errors.time}>
                <FieldLabel htmlFor="appointment-time">Heure</FieldLabel>
                {/* input time natif en register : saisie libre au
                    clavier, cohérente avec le parti pris "le staff peut
                    forcer un horaire". */}
                <Input
                  id="appointment-time"
                  type="time"
                  aria-invalid={!!errors.time}
                  {...register("time")}
                />
                <FieldError errors={[errors.time]} />
              </Field>
            </div>

            <Field data-invalid={!!errors.guest_name}>
              <FieldLabel htmlFor="appointment-guest-name">
                Nom du client
              </FieldLabel>
              <Input
                id="appointment-guest-name"
                type="text"
                placeholder="Marie Dupont"
                aria-invalid={!!errors.guest_name}
                {...register("guest_name")}
              />
              <FieldError errors={[errors.guest_name]} />
            </Field>

            <Field data-invalid={!!errors.guest_pet_name}>
              <FieldLabel htmlFor="appointment-guest-pet-name">
                Animal{" "}
                <span className="font-normal text-muted-foreground">
                  (optionnel)
                </span>
              </FieldLabel>
              <Input
                id="appointment-guest-pet-name"
                type="text"
                placeholder="Caramel"
                aria-invalid={!!errors.guest_pet_name}
                {...register("guest_pet_name")}
              />
              <FieldError errors={[errors.guest_pet_name]} />
            </Field>

            <Field data-invalid={!!errors.reason}>
              <FieldLabel htmlFor="appointment-reason">
                Motif{" "}
                <span className="font-normal text-muted-foreground">
                  (optionnel)
                </span>
              </FieldLabel>
              <Textarea
                id="appointment-reason"
                placeholder="Boiterie patte avant droite"
                aria-invalid={!!errors.reason}
                {...register("reason")}
              />
              <FieldError errors={[errors.reason]} />
            </Field>

            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Annuler
              </DialogClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Spinner data-icon="inline-start" />}
                Créer le rendez-vous
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
