/**
 * Etape 4 du wizard : choisir le creneau (calendrier + grille d'heures).
 *
 * FONCTIONNEMENT RESEAU : une requete de disponibilites PAR MOIS affiche
 * (date_from/date_to = bornes du mois, tronquees a aujourd'hui), relancee
 * seulement quand on navigue vers un autre mois — la queryKey TanStack
 * inclut les bornes, donc revenir sur un mois deja visite ressort du
 * cache. Cliquer un JOUR ne declenche AUCUNE requete : les creneaux du
 * mois sont deja la, indexes par jour.
 *
 * FUSEAUX : les creneaux arrivent en ISO UTC, le calendrier manipule des
 * Date locales. La jointure entre les deux mondes se fait UNIQUEMENT par
 * cles "YYYY-MM-DD" (toParisDateKey cote creneaux, localDayKey cote
 * calendrier) — jamais par comparaison de Date (voir lib/date/format).
 *
 * GRISAGE DES JOURS : purement COSMETIQUE (un jour sans creneau n'est pas
 * cliquable, mais l'autorite reste le backend au moment du POST).
 * Pendant le chargement d'un mois, seuls les jours passes sont grises :
 * griser tout le mois ferait "flasher" le calendrier a chaque
 * navigation.
 */
"use client";

import {
  endOfMonth,
  format as formatDateFns,
  isBefore,
  max,
  startOfDay,
  startOfMonth,
} from "date-fns";
import { fr } from "date-fns/locale";
import { useMemo, useState } from "react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useListAvailabilities } from "@/lib/api/generated/public-clinics/public-clinics";
import type {
  AvailabilitySlotResponse,
  PublicAppointmentTypeResponse,
  PublicClinicResponse,
} from "@/lib/api/generated/vetoLibAPI.schemas";
import { formatTime, localDayKey, toParisDateKey } from "@/lib/date/format";

interface StepSlotProps {
  clinic: PublicClinicResponse;
  appointmentType: PublicAppointmentTypeResponse;
  /** Message du conflit de reservation (409), affiche en tete. */
  conflictMessage: string | null;
  onSelect: (slot: AvailabilitySlotResponse) => void;
}

export function StepSlot({
  clinic,
  appointmentType,
  conflictMessage,
  onSelect,
}: StepSlotProps) {
  // Mois affiche (normalise au 1er) et jour choisi. Etat LOCAL a
  // l'etape : le wizard n'a pas besoin de connaitre le mois consulte,
  // seul le creneau finalement choisi remonte (onSelect).
  const [month, setMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(undefined);

  // Recalcule a chaque rendu : minuit local du jour courant, base des
  // comparaisons "jour passe" et de la troncature de date_from.
  const today = startOfDay(new Date());

  // Bornes de la requete du mois affiche. max(debut du mois, aujourd'hui) :
  // pour le mois courant, inutile de demander les jours deja passes (et le
  // backend refuse un date_from anterieur a aujourd'hui).
  const dateFrom = formatDateFns(max([startOfMonth(month), today]), "yyyy-MM-dd");
  const dateTo = formatDateFns(endOfMonth(month), "yyyy-MM-dd");

  const {
    data: slots,
    isPending,
    isError,
  } = useListAvailabilities(
    clinic.id,
    {
      appointment_type_id: appointmentType.id,
      date_from: dateFrom,
      date_to: dateTo,
    },
    // Narrowing : la variante 422 de l'union generee n'arrive jamais
    // jusqu'ici (le mutator jette sur tout statut >= 400).
    { query: { select: (res) => (res.status === 200 ? res.data : []) } },
  );

  // Index des creneaux par jour calendaire de Paris. Derive useMemo :
  // reconstruit uniquement quand la reponse change.
  const slotsByDay = useMemo(() => {
    const map = new Map<string, AvailabilitySlotResponse[]>();
    for (const slot of slots ?? []) {
      const key = toParisDateKey(slot.starts_at);
      const daySlots = map.get(key);
      if (daySlots !== undefined) {
        daySlots.push(slot);
      } else {
        map.set(key, [slot]);
      }
    }
    return map;
  }, [slots]);

  // L'ensemble des jours ayant au moins un creneau : la consultation
  // Set.has est O(1), appelee par le calendrier pour CHAQUE case.
  const availableDays = useMemo(
    () => new Set(slotsByDay.keys()),
    [slotsByDay],
  );

  // Creneaux du jour choisi, groupes par praticien (resource_name) en
  // preservant l'ordre chronologique du backend.
  const dayGroups = useMemo(() => {
    if (selectedDay === undefined) {
      return new Map<string, AvailabilitySlotResponse[]>();
    }
    const daySlots = slotsByDay.get(localDayKey(selectedDay)) ?? [];
    const groups = new Map<string, AvailabilitySlotResponse[]>();
    for (const slot of daySlots) {
      const group = groups.get(slot.resource_name);
      if (group !== undefined) {
        group.push(slot);
      } else {
        groups.set(slot.resource_name, [slot]);
      }
    }
    return groups;
  }, [selectedDay, slotsByDay]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Choisissez un créneau
        </h2>
        <p className="text-sm text-muted-foreground">
          {appointmentType.name} ({appointmentType.duration_minutes} min) chez{" "}
          {clinic.name}. Les horaires sont affichés en heure de Paris.
        </p>
      </div>

      {/* Conflit remonte par la confirmation (creneau pris entre-temps) :
          l'utilisateur est revenu ici pour en choisir un autre. */}
      {conflictMessage !== null && (
        <Alert variant="destructive">
          <AlertTitle>{conflictMessage}</AlertTitle>
        </Alert>
      )}

      {isError && (
        <Alert variant="destructive">
          <AlertTitle>
            Impossible de charger les disponibilités. Vérifiez votre connexion
            et réessayez.
          </AlertTitle>
        </Alert>
      )}

      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        {/* Calendrier INLINE (pas de popover) : la disponibilite par jour
            est l'information centrale de l'etape, elle merite l'espace. */}
        <Calendar
          mode="single"
          locale={fr}
          month={month}
          onMonthChange={(newMonth) => {
            setMonth(startOfMonth(newMonth));
            // Le jour choisi appartenait a l'ancien mois affiche : on le
            // deselectionne pour ne pas montrer des heures "orphelines".
            setSelectedDay(undefined);
          }}
          selected={selectedDay}
          onSelect={setSelectedDay}
          // Pas de navigation vers les mois passes : date_from resterait
          // de toute facon borne a aujourd'hui.
          startMonth={startOfMonth(today)}
          disabled={(day: Date) =>
            isBefore(day, today) ||
            // Grisage cosmetique des jours sans creneau — mais PAS
            // pendant le chargement du mois (flash tout gris sinon).
            (!isPending && !availableDays.has(localDayKey(day)))
          }
          className="mx-auto rounded-2xl border sm:mx-0"
        />

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {isPending && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          )}

          {/* Mois charge et entierement vide : on le dit clairement. */}
          {!isPending && !isError && availableDays.size === 0 && (
            <p className="text-sm text-muted-foreground">
              Aucun créneau disponible ce mois-ci. Essayez le mois suivant.
            </p>
          )}

          {!isPending && availableDays.size > 0 && selectedDay === undefined && (
            <p className="text-sm text-muted-foreground">
              Sélectionnez un jour dans le calendrier pour afficher les
              horaires.
            </p>
          )}

          {selectedDay !== undefined && (
            <div className="flex flex-col gap-4">
              {/* Le jour est un objet Date local du calendrier : on le
                  formate par ses composantes locales (date-fns), pas via
                  ISO/UTC (voir lib/date/format sur les bords de journee). */}
              <h3 className="text-sm font-medium">
                {formatDateFns(selectedDay, "EEEE d MMMM yyyy", { locale: fr })}
              </h3>

              {[...dayGroups.entries()].map(([resourceName, groupSlots]) => (
                <div key={resourceName} className="flex flex-col gap-2">
                  {/* Sous-titre par praticien uniquement s'il y a le
                      choix ; avec un seul agenda, il n'apporte rien. */}
                  {dayGroups.size > 1 && (
                    <h4 className="text-sm text-muted-foreground">
                      Avec {resourceName}
                    </h4>
                  )}
                  {/* ToggleGroup a selection simple : chaque heure est un
                      toggle ; presser = choisir le creneau ET avancer
                      (zero requete, tout est deja en memoire). */}
                  <ToggleGroup
                    aria-label={`Horaires disponibles avec ${resourceName}`}
                    variant="outline"
                    className="flex-wrap"
                    onValueChange={(groupValue: unknown[]) => {
                      const startsAt = groupValue[0];
                      const slot = groupSlots.find(
                        (candidate) => candidate.starts_at === startsAt,
                      );
                      if (slot !== undefined) {
                        onSelect(slot);
                      }
                    }}
                  >
                    {groupSlots.map((slot) => (
                      <ToggleGroupItem
                        key={`${slot.resource_id}-${slot.starts_at}`}
                        value={slot.starts_at}
                        aria-label={`Réserver à ${formatTime(slot.starts_at)}`}
                      >
                        {formatTime(slot.starts_at)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
