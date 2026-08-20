/**
 * Semaine type d'un praticien : 7 lignes jour + Switch + plage horaire.
 *
 * L'API renvoie une LISTE des seuls jours travaillés ; le formulaire la
 * projette sur un tableau FIXE de 7 jours (absent = fermé, avec
 * "09:00-18:00" en mémoire pour pré-remplir une réouverture). À l'envoi,
 * l'opération inverse : seuls les jours ouverts partent, et le PUT est
 * un REMPLACEMENT complet de la semaine côté backend — pas de diff à
 * calculer. Les heures voyagent en "HH:MM:SS" côté API, "HH:MM" côté
 * inputs time natifs : conversion aux deux frontières.
 */
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { ApiError } from "@/lib/api/errors";
import {
  getGetResourceWeeklyScheduleQueryKey,
  useGetResourceWeeklySchedule,
  useSetResourceWeeklySchedule,
} from "@/lib/api/generated/scheduling/scheduling";
import type { WeeklyScheduleResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import { applyServerErrors } from "@/lib/auth/server-errors";
import { WEEKDAYS } from "@/lib/date/format";
import {
  weeklyScheduleSchema,
  type WeeklyScheduleFormValues,
} from "@/lib/scheduling/schemas";

// Plage par défaut d'un jour qu'on rouvre : une journée type de clinique.
const DEFAULT_START = "09:00";
const DEFAULT_END = "18:00";

/**
 * Projette la liste API (jours travaillés seulement, heures HH:MM:SS)
 * sur les 7 jours du formulaire (heures HH:MM pour les inputs time).
 * L'UI gère UNE plage par jour : si le backend en portait plusieurs
 * (possible dans son modèle), on n'édite que la première.
 */
function toFormValues(items: WeeklyScheduleResponse[]): WeeklyScheduleFormValues {
  return {
    days: WEEKDAYS.map((weekday) => {
      const entry = items.find((item) => item.weekday === weekday.value);
      return entry !== undefined
        ? {
            open: true,
            start: entry.start_time.slice(0, 5),
            end: entry.end_time.slice(0, 5),
          }
        : { open: false, start: DEFAULT_START, end: DEFAULT_END };
    }),
  };
}

export function WeeklyScheduleForm({ resourceId }: { resourceId: string }) {
  const queryClient = useQueryClient();
  const scheduleQuery = useGetResourceWeeklySchedule(resourceId, {
    // res.status === 200 : rétrécissement TypeScript uniquement (l'union
    // générée inclut la variante 422 ; le mutator jette sur >= 400).
    query: { select: (res) => (res.status === 200 ? res.data : []) },
  });
  const setMutation = useSetResourceWeeklySchedule<ApiError>();

  const [saved, setSaved] = useState(false);

  const formValues = useMemo(
    () =>
      scheduleQuery.data !== undefined
        ? toFormValues(scheduleQuery.data)
        : undefined,
    [scheduleQuery.data],
  );

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<WeeklyScheduleFormValues>({
    resolver: zodResolver(weeklyScheduleSchema),
    // values : resynchronise quand la query arrive (le composant est
    // remonté par praticien via key, mais la donnée arrive APRÈS).
    values: formValues,
    resetOptions: { keepDirtyValues: true },
  });

  // useWatch (et non watch()) : abonnement déclaré au niveau du
  // composant, compatible avec les règles react-hooks du projet. Sert à
  // activer/désactiver les inputs heure quand un Switch de jour bascule.
  const daysValues = useWatch({ control, name: "days" });

  const onSubmit = handleSubmit(async (values) => {
    setSaved(false);
    // Seuls les jours OUVERTS partent ; l'index du tableau EST le
    // weekday (0 = lundi), capturé avant le filter qui casse les index.
    const items = values.days
      .map((day, weekday) => ({ ...day, weekday }))
      .filter((day) => day.open)
      .map((day) => ({
        weekday: day.weekday,
        // "HH:MM" (input time) -> "HH:MM:SS" (API).
        start_time: `${day.start}:00`,
        end_time: `${day.end}:00`,
      }));

    try {
      await setMutation.mutateAsync({ resourceId, data: { items } });
      // Refetch de la semaine type de CE praticien (clé paramétrée).
      await queryClient.invalidateQueries({
        queryKey: getGetResourceWeeklyScheduleQueryKey(resourceId),
      });
      setSaved(true);
    } catch (error) {
      // Pas de champ candidat pour un 422 ici (structure calculée) :
      // tout part en bandeau global.
      applyServerErrors(error, setError, []);
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Semaine type</CardTitle>
        <CardDescription>
          Les jours et horaires où ce praticien reçoit des rendez-vous.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {scheduleQuery.isPending && (
          <div className="flex flex-col gap-2">
            {WEEKDAYS.map((weekday) => (
              <Skeleton key={weekday.value} className="h-9 w-full" />
            ))}
          </div>
        )}

        {scheduleQuery.isError && (
          <Alert variant="destructive">
            <AlertTitle>Impossible de charger la semaine type.</AlertTitle>
          </Alert>
        )}

        {scheduleQuery.data !== undefined && (
          <form onSubmit={onSubmit} onChange={() => setSaved(false)} noValidate>
            <div className="flex flex-col gap-4">
              {errors.root?.server && (
                <Alert variant="destructive">
                  <AlertTitle>{errors.root.server.message}</AlertTitle>
                </Alert>
              )}

              {saved && (
                <Alert>
                  <AlertTitle>Horaires enregistrés</AlertTitle>
                </Alert>
              )}

              {WEEKDAYS.map((weekday, i) => {
                // ?? false : avant la première synchronisation de
                // `values`, le tableau peut être encore indéfini.
                const open = daysValues?.[i]?.open ?? false;
                return (
                  <div
                    key={weekday.value}
                    className="grid grid-cols-[6rem_auto_1fr] items-center gap-3"
                  >
                    <Label
                      htmlFor={`day-open-${i}`}
                      className="text-sm font-medium"
                    >
                      {weekday.label}
                    </Label>
                    {/* Switch Base UI contrôlé -> Controller ; le
                        setSaved(false) explicite : son clic ne déclenche
                        pas le onChange DOM du <form>. */}
                    <Controller
                      control={control}
                      name={`days.${i}.open`}
                      render={({ field }) => (
                        <Switch
                          id={`day-open-${i}`}
                          checked={field.value}
                          onCheckedChange={(checked) => {
                            setSaved(false);
                            field.onChange(checked);
                          }}
                        />
                      )}
                    />
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        {/* Inputs time natifs en register : jour fermé =
                            inputs désactivés (valeurs gardées en mémoire
                            mais ni validées ni envoyées). */}
                        <Input
                          type="time"
                          className="w-28"
                          disabled={!open}
                          aria-label={`Ouverture ${weekday.label}`}
                          aria-invalid={!!errors.days?.[i]?.end}
                          {...register(`days.${i}.start`)}
                        />
                        <span className="text-sm text-muted-foreground">-</span>
                        <Input
                          type="time"
                          className="w-28"
                          disabled={!open}
                          aria-label={`Fermeture ${weekday.label}`}
                          aria-invalid={!!errors.days?.[i]?.end}
                          {...register(`days.${i}.end`)}
                        />
                      </div>
                      {/* Erreur ciblée de la ligne (end > start...),
                          postée par le superRefine sur days.i.end. */}
                      <FieldError errors={[errors.days?.[i]?.end]} />
                    </div>
                  </div>
                );
              })}

              <div>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Spinner data-icon="inline-start" />}
                  Enregistrer les horaires
                </Button>
              </div>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
