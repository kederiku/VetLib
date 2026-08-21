/**
 * Semaine type d'un praticien : 7 lignes jour + Switch + plages horaires.
 *
 * L'API renvoie une LISTE de plages (weekday, start, end) des seuls
 * jours travaillés — un même jour peut porter PLUSIEURS plages (matin +
 * après-midi autour d'une pause déjeuner). Le formulaire la projette sur
 * un tableau FIXE de 7 jours, chacun avec SES plages (absent = fermé,
 * avec "09:00-18:00" en mémoire pour pré-remplir une réouverture). À
 * l'envoi, l'opération inverse : toutes les plages des jours ouverts
 * sont aplaties, et le PUT est un REMPLACEMENT complet de la semaine
 * côté backend — pas de diff à calculer. Les heures voyagent en
 * "HH:MM:SS" côté API, "HH:MM" côté inputs time natifs : conversion aux
 * deux frontières.
 *
 * Chaque jour édite ses plages via useFieldArray ; comme un hook ne
 * peut pas être appelé dans une boucle, chaque ligne est un
 * sous-composant <DayScheduleRow> qui appelle useFieldArray pour SON
 * index de jour.
 */
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useMemo } from "react";
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormGetValues,
  type UseFormRegister,
} from "react-hook-form";
import { toast } from "sonner";

import { ErrorState } from "@/components/shared/error-state";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
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

// Format HH:MM des <input type="time"> (même garde que dans le schéma
// zod) : sert ici à sécuriser les calculs de pré-remplissage.
const TIME_HH_MM = /^\d{2}:\d{2}$/;

/**
 * Ajoute des heures à un "HH:MM" en plafonnant à 23:00 : les
 * suggestions de plage ne doivent jamais déborder sur le lendemain.
 */
function addHoursCapped(time: string, hours: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = Math.min(h * 60 + m + hours * 60, 23 * 60);
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Suggère la plage à AJOUTER après les plages existantes d'un jour :
 * si la dernière finit le matin (avant 14:00), on propose l'après-midi
 * type 14:00-18:00 ; sinon on enchaîne une heure après la dernière fin,
 * sur 4 heures, plafonné à 23:00. Simple heuristique de confort : la
 * plage reste éditable et validée comme les autres.
 */
function nextRangeSuggestion(ranges: { start: string; end: string }[]): {
  start: string;
  end: string;
} {
  const last = ranges[ranges.length - 1];
  if (last === undefined || !TIME_HH_MM.test(last.end) || last.end < "14:00") {
    return { start: "14:00", end: "18:00" };
  }
  const start = addHoursCapped(last.end, 1);
  return { start, end: addHoursCapped(start, 4) };
}

/**
 * Projette la liste API (plages des jours travaillés, heures HH:MM:SS)
 * sur les 7 jours du formulaire (heures HH:MM pour les inputs time).
 * TOUTES les plages d'un jour sont reprises — un PUT qui n'en éditerait
 * que la première effacerait silencieusement les suivantes.
 */
function toFormValues(items: WeeklyScheduleResponse[]): WeeklyScheduleFormValues {
  return {
    days: WEEKDAYS.map((weekday) => {
      const ranges = items
        .filter((item) => item.weekday === weekday.value)
        .map((item) => ({
          start: item.start_time.slice(0, 5),
          end: item.end_time.slice(0, 5),
        }))
        // Tri chronologique (lexical HH:MM) : affichage stable quel que
        // soit l'ordre renvoyé par l'API.
        .sort((a, b) => (a.start < b.start ? -1 : 1));
      return ranges.length > 0
        ? { open: true, ranges }
        : { open: false, ranges: [{ start: DEFAULT_START, end: DEFAULT_END }] };
    }),
  };
}

/**
 * Une ligne de jour : Switch ouvert/fermé + la liste éditable de ses
 * plages. Sous-composant OBLIGATOIRE : useFieldArray est un hook, il ne
 * peut pas être appelé dans le .map() du parent — chaque ligne monte le
 * sien sur `days.${index}.ranges`.
 */
function DayScheduleRow({
  index,
  label,
  control,
  register,
  errors,
  getValues,
}: {
  /** Index du jour (0 = lundi) : c'est AUSSI le weekday backend. */
  index: number;
  label: string;
  control: Control<WeeklyScheduleFormValues>;
  register: UseFormRegister<WeeklyScheduleFormValues>;
  errors: FieldErrors<WeeklyScheduleFormValues>;
  getValues: UseFormGetValues<WeeklyScheduleFormValues>;
}) {
  // Plages du jour : fields fournit les lignes (key stable field.id),
  // append/remove les mutations. remove est masqué à 1 plage : un jour
  // ouvert a toujours au moins une plage (mirroir du .min(1) du schéma).
  const { fields, append, remove } = useFieldArray({
    control,
    name: `days.${index}.ranges`,
  });

  // Abonnement au Switch du jour : active/désactive les inputs heure.
  const open = useWatch({ control, name: `days.${index}.open` });

  const rangesErrors = errors.days?.[index]?.ranges;

  return (
    <div className="grid grid-cols-[6rem_auto_1fr] items-start gap-3">
      {/* mt-2 : aligne label et Switch sur la PREMIÈRE plage (input
          h-9), les plages suivantes s'empilent dessous. */}
      <Label htmlFor={`day-open-${index}`} className="mt-2 text-sm font-medium">
        {label}
      </Label>
      {/* Switch Base UI contrôlé -> Controller. */}
      <Controller
        control={control}
        name={`days.${index}.open`}
        render={({ field }) => (
          <Switch
            id={`day-open-${index}`}
            className="mt-2"
            checked={field.value}
            onCheckedChange={(checked) => field.onChange(checked)}
          />
        )}
      />
      <div className="flex flex-col gap-2">
        {fields.map((rangeField, j) => (
          <div key={rangeField.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              {/* Inputs time natifs en register : jour fermé = inputs
                  désactivés (valeurs gardées en mémoire mais ni
                  validées ni envoyées). */}
              <Input
                type="time"
                className="w-28"
                disabled={!open}
                aria-label={`Ouverture ${label} (plage ${j + 1})`}
                aria-invalid={!!rangesErrors?.[j]?.end}
                {...register(`days.${index}.ranges.${j}.start`)}
              />
              <span className="text-sm text-muted-foreground">-</span>
              <Input
                type="time"
                className="w-28"
                disabled={!open}
                aria-label={`Fermeture ${label} (plage ${j + 1})`}
                aria-invalid={!!rangesErrors?.[j]?.end}
                {...register(`days.${index}.ranges.${j}.end`)}
              />
              {/* Supprimer la plage : masqué quand il n'en reste qu'une
                  (un jour ouvert garde au moins une plage). */}
              {fields.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={!open}
                  aria-label={`Supprimer la plage ${j + 1} (${label})`}
                  onClick={() => remove(j)}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
            {/* Erreur ciblée de la plage (fin > début, chevauchement...),
                postée par le superRefine sur days.i.ranges.j.end. */}
            <FieldError errors={[rangesErrors?.[j]?.end]} />
          </div>
        ))}
        {/* Ajout d'une plage (pause déjeuner...) : visible seulement sur
            un jour ouvert, pré-remplie par l'heuristique ci-dessus. */}
        {open && (
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                append(nextRangeSuggestion(getValues(`days.${index}.ranges`)))
              }
            >
              <Plus data-icon="inline-start" />
              Ajouter une plage
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function WeeklyScheduleForm({ resourceId }: { resourceId: string }) {
  const queryClient = useQueryClient();
  const scheduleQuery = useGetResourceWeeklySchedule(resourceId, {
    // res.status === 200 : rétrécissement TypeScript uniquement (l'union
    // générée inclut la variante 422 ; le mutator jette sur >= 400).
    query: { select: (res) => (res.status === 200 ? res.data : []) },
  });
  const setMutation = useSetResourceWeeklySchedule<ApiError>();

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
    getValues,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<WeeklyScheduleFormValues>({
    resolver: zodResolver(weeklyScheduleSchema),
    // defaultValues AVANT l'arrivee de la query : sans eux, field.value
    // des Switch de jour serait undefined au premier rendu -> Base UI
    // verrait un composant non controle devenir controle (warning
    // console "uncontrolled to controlled Switch").
    defaultValues: {
      days: WEEKDAYS.map(() => ({
        open: false,
        ranges: [{ start: DEFAULT_START, end: DEFAULT_END }],
      })),
    },
    // values : resynchronise quand la query arrive (le composant est
    // remonté par praticien via key, donc AUCUN champ n'est dirty au
    // montage : keepDirtyValues n'empêche pas de repartir des données
    // du nouveau praticien).
    values: formValues,
    resetOptions: { keepDirtyValues: true },
  });

  // "Copier lundi sur la semaine" : recopie l'état du jour 0 (ouvert +
  // plages) sur les jours 1 à 6. Les plages sont CLONÉES (map + spread) :
  // partager les mêmes objets entre jours créerait des modifications
  // fantômes d'un jour à l'autre. shouldDirty : le bouton Enregistrer
  // doit voir la semaine comme modifiée.
  const copyMondayToWeek = () => {
    const monday = getValues("days.0");
    for (let i = 1; i < 7; i += 1) {
      setValue(`days.${i}.open`, monday.open, { shouldDirty: true });
      setValue(
        `days.${i}.ranges`,
        monday.ranges.map((range) => ({ ...range })),
        { shouldDirty: true },
      );
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    // Toutes les plages des jours OUVERTS partent à plat ; l'index du
    // tableau EST le weekday (0 = lundi).
    const items = values.days.flatMap((day, weekday) =>
      day.open
        ? day.ranges.map((range) => ({
            weekday,
            // "HH:MM" (input time) -> "HH:MM:SS" (API).
            start_time: `${range.start}:00`,
            end_time: `${range.end}:00`,
          }))
        : [],
    );

    try {
      await setMutation.mutateAsync({ resourceId, data: { items } });
      // Refetch de la semaine type de CE praticien (clé paramétrée).
      await queryClient.invalidateQueries({
        queryKey: getGetResourceWeeklyScheduleQueryKey(resourceId),
      });
      toast.success("Horaires enregistrés");
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
        <CardAction>
          {/* Désactivé tant que la query n'a pas peuplé le formulaire :
              copier les valeurs par défaut n'aurait pas de sens. */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={scheduleQuery.data === undefined}
            onClick={copyMondayToWeek}
          >
            Copier lundi sur la semaine
          </Button>
        </CardAction>
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
          <ErrorState
            title="Impossible de charger la semaine type."
            onRetry={() => void scheduleQuery.refetch()}
          />
        )}

        {scheduleQuery.data !== undefined && (
          <form onSubmit={onSubmit} noValidate>
            <div className="flex flex-col gap-4">
              {errors.root?.server && (
                <Alert variant="destructive">
                  <AlertTitle>{errors.root.server.message}</AlertTitle>
                </Alert>
              )}

              {WEEKDAYS.map((weekday, i) => (
                <DayScheduleRow
                  key={weekday.value}
                  index={i}
                  label={weekday.label}
                  control={control}
                  register={register}
                  errors={errors}
                  getValues={getValues}
                />
              ))}

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
