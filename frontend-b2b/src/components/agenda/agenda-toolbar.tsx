/**
 * Barre d'outils de l'agenda : navigation temporelle, bascule de vue,
 * filtre praticien et création de rendez-vous.
 *
 * Composant PRÉSENTATIONNEL : tout l'état (période, vue, filtre) vit
 * dans AgendaContent, la toolbar ne fait que l'afficher et remonter les
 * intentions via ses callbacks — plus simple à lire et à tester qu'un
 * état dupliqué.
 */
"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ResourceResponse } from "@/lib/api/generated/vetoLibAPI.schemas";

// Les deux vues de l'agenda. Le type vit ici (et non dans AgendaContent)
// pour éviter un import circulaire content <-> toolbar.
export type AgendaView = "day" | "week";

// Valeur sentinelle du filtre "tous les praticiens" : le composant
// parent l'exclut des params de la requête (le backend attend soit un
// UUID, soit RIEN — jamais une chaîne vide).
export const ALL_RESOURCES = "all";

type AgendaToolbarProps = {
  view: AgendaView;
  onViewChange: (view: AgendaView) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  /** Libellé de la période affichée ("24-30 août 2026"). */
  rangeLabel: string;
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
  resourceId,
  onResourceChange,
  resources,
  onNewAppointment,
}: AgendaToolbarProps) {
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
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Période suivante"
          onClick={onNext}
        >
          <ChevronRight />
        </Button>
        <Button variant="outline" size="sm" onClick={onToday}>
          Aujourd&apos;hui
        </Button>
      </div>

      {/* first-letter:uppercase : Intl produit le libellé en minuscules. */}
      <span className="min-w-40 text-sm font-medium first-letter:uppercase">
        {rangeLabel}
      </span>

      {/* Bascule Jour/Semaine : deux boutons, celui de la vue courante
          en "secondary" (enfoncé), l'autre en "ghost". */}
      <div className="flex items-center gap-0.5 rounded-4xl border p-0.5">
        <Button
          variant={view === "day" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => onViewChange("day")}
        >
          Jour
        </Button>
        <Button
          variant={view === "week" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => onViewChange("week")}
        >
          Semaine
        </Button>
      </div>

      <div className="ml-auto flex items-center gap-2">
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
          <Plus data-icon="inline-start" />
          Nouveau rendez-vous
        </Button>
      </div>
    </div>
  );
}
