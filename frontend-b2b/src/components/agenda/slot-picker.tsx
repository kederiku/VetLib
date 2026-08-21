/**
 * Sélecteur de créneaux DISPONIBLES pour le dialog "Nouveau rendez-vous".
 *
 * Interroge le même endpoint public de disponibilités que le portail
 * B2C (créneaux calculés par le backend : horaires d'ouverture moins
 * absences moins rendez-vous existants) et les propose groupés par
 * praticien. Choisir un créneau remplit d'un coup l'heure ET le
 * praticien — fini la saisie d'heure à l'aveugle qui se soldait par un
 * 409 "créneau déjà pris".
 *
 * La requête ne part que quand type + date sont choisis (enabled) : le
 * backend a besoin du type pour connaître la durée des créneaux.
 */
"use client";

import { CalendarOffIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useListAvailabilities } from "@/lib/api/generated/public-clinics/public-clinics";
import type { AvailabilitySlotResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { formatTime, toIsoDate } from "@/lib/date/format";

type SlotPickerProps = {
  /** Type de rendez-vous choisi ("" tant qu'aucun). */
  appointmentTypeId: string;
  /** Jour choisi dans le calendrier du dialog. */
  date: Date | undefined;
  /** Praticien déjà choisi dans le Select ("" = tous). */
  resourceId: string;
  /** Heure actuellement retenue dans le formulaire ("HH:MM"). */
  selectedTime: string;
  /** Choix d'un créneau : écrit heure + praticien dans le formulaire. */
  onSelect: (slot: { time: string; resourceId: string }) => void;
};

export function SlotPicker({
  appointmentTypeId,
  date,
  resourceId,
  selectedTime,
  onSelect,
}: SlotPickerProps) {
  const { data: user } = useCurrentUser();

  const enabled =
    user !== undefined && appointmentTypeId !== "" && date !== undefined;

  const availabilitiesQuery = useListAvailabilities(
    user?.clinic_id ?? "",
    {
      appointment_type_id: appointmentTypeId,
      // Un seul jour : le calendrier du dialog choisit déjà la date.
      date_from: date !== undefined ? toIsoDate(date) : "",
      date_to: date !== undefined ? toIsoDate(date) : "",
    },
    {
      query: {
        enabled,
        // Test de statut : rétrécit l'union générée (variante 422
        // incluse) — le mutator jette sur tout statut >= 400.
        select: (res) => (res.status === 200 ? res.data : []),
      },
    },
  );

  if (!enabled) {
    return (
      <p className="text-sm text-muted-foreground">
        Choisissez un type de rendez-vous et une date pour voir les créneaux
        disponibles.
      </p>
    );
  }

  if (availabilitiesQuery.isPending) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-32" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>
    );
  }

  if (availabilitiesQuery.isError) {
    return (
      <p className="text-sm text-destructive">
        Impossible de charger les créneaux disponibles. Vous pouvez saisir une
        heure libre.
      </p>
    );
  }

  // Filtre praticien éventuel, puis regroupement par praticien : une
  // clinique à 4 vétérinaires reste lisible (un paragraphe chacun).
  const slots = availabilitiesQuery.data.filter(
    (slot) => resourceId === "" || slot.resource_id === resourceId,
  );

  if (slots.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CalendarOffIcon aria-hidden="true" className="size-4 shrink-0" />
        <span>
          Aucun créneau disponible ce jour. Choisissez une autre date, ou
          saisissez une heure libre pour forcer un rendez-vous hors grille.
        </span>
      </div>
    );
  }

  const byResource = new Map<string, AvailabilitySlotResponse[]>();
  for (const slot of slots) {
    const group = byResource.get(slot.resource_id) ?? [];
    group.push(slot);
    byResource.set(slot.resource_id, group);
  }

  return (
    <div className="flex max-h-48 flex-col gap-3 overflow-y-auto pr-1">
      {[...byResource.entries()].map(([groupResourceId, groupSlots]) => (
        <div key={groupResourceId} className="flex flex-col gap-1.5">
          {/* Nom du praticien omis quand le filtre en impose un seul :
              il est déjà affiché dans le Select au-dessus. */}
          {resourceId === "" && (
            <h4 className="text-xs font-medium text-muted-foreground">
              {groupSlots[0].resource_name}
            </h4>
          )}
          {/* ToggleGroup à sélection simple : Base UI renvoie un TABLEAU
              de valeurs, on lit la première. La valeur "contrôlée" est
              l'heure retenue quand elle appartient à ce praticien. */}
          <ToggleGroup
            aria-label={`Créneaux disponibles avec ${groupSlots[0].resource_name}`}
            variant="outline"
            className="flex-wrap"
            value={groupSlots
              .filter(
                (slot) =>
                  formatTime(slot.starts_at) === selectedTime &&
                  slot.resource_id === groupResourceId,
              )
              .map((slot) => slot.starts_at)}
            onValueChange={(groupValue: unknown[]) => {
              const startsAt = groupValue[0];
              const slot = groupSlots.find(
                (candidate) => candidate.starts_at === startsAt,
              );
              if (slot !== undefined) {
                onSelect({
                  time: formatTime(slot.starts_at),
                  resourceId: slot.resource_id,
                });
              }
            }}
          >
            {groupSlots.map((slot) => (
              <ToggleGroupItem
                key={`${slot.resource_id}-${slot.starts_at}`}
                value={slot.starts_at}
                aria-label={`Créneau de ${formatTime(slot.starts_at)} avec ${slot.resource_name}`}
              >
                {formatTime(slot.starts_at)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      ))}
    </div>
  );
}
