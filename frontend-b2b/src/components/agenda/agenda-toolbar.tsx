/**
 * Barre d'outils de l'agenda : navigation temporelle, bascule de vue,
 * filtre praticien et création de rendez-vous.
 *
 * Composant PRÉSENTATIONNEL : tout l'état (période, vue, filtre) vit
 * dans AgendaContent (et dans l'URL), la toolbar ne fait que l'afficher
 * et remonter les intentions via ses callbacks.
 *
 * Deux affordances de navigation rapide :
 * - le libellé de période est CLIQUABLE : il ouvre un calendrier pour
 *   sauter directement à une date lointaine (les flèches ne servent
 *   qu'aux pas d'une semaine/un jour) ;
 * - la bascule Jour/Semaine est un vrai ToggleGroup (état enfoncé
 *   accessible, sémantique de groupe pour les lecteurs d'écran).
 */
"use client";

import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { fr } from "react-day-picker/locale";

import {
  ALL_RESOURCES,
  type AgendaView,
} from "@/components/agenda/use-agenda-url-state";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ResourceResponse } from "@/lib/api/generated/vetoLibAPI.schemas";

// Réexport de compatibilité : la sentinelle et le type de vue vivent
// désormais dans use-agenda-url-state (source de vérité de l'état).
export { ALL_RESOURCES, type AgendaView };

type AgendaToolbarProps = {
  view: AgendaView;
  onViewChange: (view: AgendaView) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  /** Libellé de la période affichée ("24-30 août 2026"). */
  rangeLabel: string;
  /** Date d'ancrage courante (sélection initiale du calendrier). */
  anchorDate: Date;
  /** Saut direct à une date choisie dans le calendrier. */
  onAnchorSelect: (date: Date) => void;
  /** Praticien filtré (ALL_RESOURCES = pas de filtre). */
  resourceId: string;
  onResourceChange: (resourceId: string) => void;
  /** Praticiens actifs proposés dans le filtre. */
  resources: ResourceResponse[];
  onNewAppointment: () => void;
};

export function AgendaToolbar({
  view,
  onViewChange,
  onPrevious,
  onNext,
  onToday,
  rangeLabel,
  anchorDate,
  onAnchorSelect,
  resourceId,
  onResourceChange,
  resources,
  onNewAppointment,
}: AgendaToolbarProps) {
  // Popover du calendrier : contrôlé pour le fermer dès qu'une date est
  // choisie (Base UI ne le fait pas tout seul).
  const [calendarOpen, setCalendarOpen] = useState(false);

  // items : Base UI s'en sert pour afficher le LIBELLÉ (nom du
  // praticien) dans le trigger, au lieu de la valeur brute (UUID).
  const resourceItems = [
    { value: ALL_RESOURCES, label: "Tous les praticiens" },
    ...resources.map((resource) => ({
      value: resource.id,
      label: resource.name,
    })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Période précédente"
          onClick={onPrevious}
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Période suivante"
          onClick={onNext}
        >
          <ChevronRightIcon />
        </Button>
        <Button variant="outline" size="sm" onClick={onToday}>
          Aujourd&apos;hui
        </Button>
      </div>

      {/* Libellé de période cliquable -> calendrier de saut direct. */}
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              aria-label="Choisir la période affichée"
            />
          }
        >
          <CalendarIcon data-icon="inline-start" />
          {/* first-letter:uppercase : Intl produit le libellé en
              minuscules. */}
          <span className="text-sm font-medium first-letter:uppercase">
            {rangeLabel}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            locale={fr}
            selected={anchorDate}
            onSelect={(date) => {
              if (date !== undefined) {
                onAnchorSelect(date);
              }
              setCalendarOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>

      {/* Bascule de vue : sélection simple — Base UI renvoie toujours un
          TABLEAU de valeurs, on en lit le premier élément. Presser le
          bouton déjà actif renverrait un tableau vide : on l'ignore (une
          vue est toujours active). */}
      <ToggleGroup
        aria-label="Choisir la vue de l'agenda"
        variant="outline"
        value={[view]}
        onValueChange={(groupValue: unknown[]) => {
          const next = groupValue[0];
          if (next === "day" || next === "week") {
            onViewChange(next);
          }
        }}
      >
        <ToggleGroupItem value="day">Jour</ToggleGroupItem>
        <ToggleGroupItem value="week">Semaine</ToggleGroupItem>
      </ToggleGroup>

      {/* flex-wrap : sur mobile, filtre et CTA passent à la ligne au
          lieu de déborder de l'écran. */}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Select
          items={resourceItems}
          value={resourceId}
          onValueChange={(value) => {
            if (typeof value === "string") {
              onResourceChange(value);
            }
          }}
        >
          <SelectTrigger className="w-52" aria-label="Filtrer par praticien">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {resourceItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={onNewAppointment}>
          <PlusIcon data-icon="inline-start" />
          Nouveau rendez-vous
        </Button>
      </div>
    </div>
  );
}
