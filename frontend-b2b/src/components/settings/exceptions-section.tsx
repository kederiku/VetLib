/**
 * Absences et fermetures exceptionnelles d'un praticien.
 *
 * Une exception est une PÉRIODE d'indisponibilité (congés, formation,
 * jour férié travaillé ailleurs...) qui prime sur la semaine type. L'UI
 * raisonne en JOURS PLEINS : un Calendar en mode range choisit du
 * premier au dernier jour, et l'envoi convertit en instants — début du
 * premier jour (00:00:00 locale) et fin du dernier (23:59:59 locale),
 * convertis en ISO UTC. Formulaire en état local (un range + une raison
 * facultative) validé par exceptionSchema au submit : pas besoin de
 * react-hook-form pour deux champs sans saisie clavier complexe.
 */
"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CalendarIcon, CalendarOff, Trash2 } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { fr } from "react-day-picker/locale";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { ApiError } from "@/lib/api/errors";
import {
  getListResourceExceptionsQueryKey,
  useCreateResourceException,
  useDeleteResourceException,
  useListResourceExceptions,
} from "@/lib/api/generated/scheduling/scheduling";
import type { ScheduleExceptionResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import { messageForApiError } from "@/lib/auth/server-errors";
import { formatDateRangeLabel } from "@/lib/date/format";
import { exceptionSchema } from "@/lib/scheduling/schemas";

/** Minuit (00:00:00) LOCAL du jour donné. */
function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
}

/** Fin de journée (23:59:59) LOCALE du jour donné. */
function endOfLocalDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
  );
}

export function ExceptionsSection({ resourceId }: { resourceId: string }) {
  const queryClient = useQueryClient();

  const exceptionsQuery = useListResourceExceptions(resourceId, {
    // res.status === 200 : rétrécissement TypeScript uniquement (l'union
    // générée inclut la variante 422 ; le mutator jette sur >= 400).
    query: { select: (res) => (res.status === 200 ? res.data : []) },
  });
  const createMutation = useCreateResourceException<ApiError>();
  const deleteMutation = useDeleteResourceException<ApiError>();

  // Formulaire d'ajout : période choisie dans le Calendar + raison.
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [reason, setReason] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);
  // Erreur du formulaire d'ajout UNIQUEMENT (déjà en français) : les
  // erreurs de formulaire restent inline ; celles des actions hors
  // formulaire (suppression) partent en toast.error.
  const [formError, setFormError] = useState<string | null>(null);
  // Exception dont la suppression est en cours de confirmation.
  const [toDelete, setToDelete] = useState<ScheduleExceptionResponse | null>(
    null,
  );

  // Un clic unique dans le Calendar range donne {from, to: undefined} :
  // on le normalise en absence d'UN jour (to = from) plutôt que de
  // forcer un second clic sur le même jour.
  const normalizedRange =
    range?.from !== undefined
      ? { from: range.from, to: range.to ?? range.from }
      : undefined;

  const handleAdd = async () => {
    setFormError(null);
    // Validation zod au submit (pas de react-hook-form ici) : premier
    // message d'erreur affiché dans l'Alert du formulaire.
    const parsed = exceptionSchema.safeParse({
      range: normalizedRange,
      reason,
    });
    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message ?? "Période invalide.",
      );
      return;
    }

    const { from, to } = parsed.data.range;
    try {
      await createMutation.mutateAsync({
        resourceId,
        data: {
          // Jours pleins -> instants : début du 1er jour et fin du
          // dernier, en heure LOCALE du poste (supposé Europe/Paris)
          // convertie en ISO UTC par toISOString.
          starts_at: startOfLocalDay(from).toISOString(),
          ends_at: endOfLocalDay(to).toISOString(),
          reason: parsed.data.reason || null,
        },
      });
      await queryClient.invalidateQueries({
        queryKey: getListResourceExceptionsQueryKey(resourceId),
      });
      toast.success("Absence ajoutée");
      // Formulaire prêt pour une prochaine saisie.
      setRange(undefined);
      setReason("");
    } catch (error) {
      setFormError(messageForApiError(error));
    }
  };

  const handleDelete = async () => {
    if (toDelete === null) {
      return;
    }
    try {
      await deleteMutation.mutateAsync({
        resourceId,
        exceptionId: toDelete.id,
      });
      await queryClient.invalidateQueries({
        queryKey: getListResourceExceptionsQueryKey(resourceId),
      });
      toast.success("Absence supprimée");
    } catch (error) {
      // Action hors formulaire : l'erreur part en toast (le bandeau
      // inline est réservé au formulaire d'ajout).
      toast.error(messageForApiError(error));
    } finally {
      setToDelete(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Absences</CardTitle>
        <CardDescription>
          Congés et fermetures exceptionnelles : aucune prise de rendez-vous
          sur ces périodes.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {formError !== null && (
          <Alert variant="destructive">
            <AlertTitle>{formError}</AlertTitle>
          </Alert>
        )}

        {exceptionsQuery.isPending && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        )}

        {exceptionsQuery.isError && (
          <ErrorState
            title="Impossible de charger les absences."
            onRetry={() => void exceptionsQuery.refetch()}
          />
        )}

        {exceptionsQuery.data !== undefined &&
          (exceptionsQuery.data.length === 0 ? (
            <EmptyState
              icon={<CalendarOff />}
              title="Aucune absence enregistrée"
              description="Les périodes ajoutées ici bloquent la prise de rendez-vous en ligne."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {exceptionsQuery.data.map((exception) => (
                <li
                  key={exception.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border p-3"
                >
                  <div className="flex min-w-0 flex-col">
                    {/* Les bornes stockées (début 1er jour / fin dernier
                        jour) retombent sur les bons jours à l'affichage
                        en fuseau clinique. */}
                    <span className="text-sm font-medium first-letter:uppercase">
                      {formatDateRangeLabel(
                        new Date(exception.starts_at),
                        new Date(exception.ends_at),
                      )}
                    </span>
                    {exception.reason !== null && exception.reason !== "" && (
                      <span className="truncate text-sm text-muted-foreground">
                        {exception.reason}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Supprimer cette absence"
                    onClick={() => setToDelete(exception)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          ))}

        {/* Separator + FieldSet : sans eux, le formulaire d'ajout se
            confondait avec les items de la liste juste au-dessus (mêmes
            bordures, aucun titre) — on marque nettement la frontière
            entre "ce qui existe" et "ce qu'on ajoute". */}
        <Separator />
        <FieldSet>
          <FieldLegend variant="label">Ajouter une absence</FieldLegend>
          <div className="flex flex-wrap items-center gap-2">
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    className="justify-start font-normal"
                  />
                }
              >
                <CalendarIcon data-icon="inline-start" />
                <span className="first-letter:uppercase">
                  {normalizedRange !== undefined
                    ? formatDateRangeLabel(
                        normalizedRange.from,
                        normalizedRange.to,
                      )
                    : "Choisir la période"}
                </span>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="range"
                  locale={fr}
                  selected={range}
                  onSelect={setRange}
                />
              </PopoverContent>
            </Popover>

            <Input
              type="text"
              className="w-56"
              placeholder="Raison (facultatif)"
              aria-label="Raison de l'absence"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />

            <Button
              variant="secondary"
              disabled={createMutation.isPending}
              onClick={handleAdd}
            >
              {createMutation.isPending && <Spinner data-icon="inline-start" />}
              Ajouter l&apos;absence
            </Button>
          </div>
        </FieldSet>
      </CardContent>

      {/* Confirmation de suppression : une absence supprimée rouvre
          immédiatement les créneaux de la période à la réservation. */}
      <AlertDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette absence ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les créneaux de la période redeviendront réservables
              immédiatement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Retour</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={handleDelete}
            >
              {deleteMutation.isPending && <Spinner data-icon="inline-start" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
