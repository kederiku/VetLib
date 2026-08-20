/**
 * Onglet "Horaires" : semaine type + absences d'UN praticien à la fois.
 *
 * Le praticien sélectionné vit dans un simple useState local (pas dans
 * l'URL : c'est un contexte de travail momentané du gérant). Les deux
 * sections enfants reçoivent key={resourceId} : changer de praticien les
 * REMONTE entièrement, donc réinitialise leurs formulaires et états
 * locaux — impossible d'enregistrer les horaires de l'un sur l'autre.
 */
"use client";

import { CalendarCog } from "lucide-react";
import { useState } from "react";

import { ExceptionsSection } from "@/components/settings/exceptions-section";
import { WeeklyScheduleForm } from "@/components/settings/weekly-schedule-form";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useListResources } from "@/lib/api/generated/scheduling/scheduling";

export function ScheduleTab() {
  // Praticiens ACTIFS uniquement : on ne règle pas les horaires d'un
  // praticien désactivé (il ne reçoit plus de rendez-vous).
  const resourcesQuery = useListResources({
    query: { select: (res) => res.data.filter((r) => r.active) },
  });
  const resources = resourcesQuery.data ?? [];

  // "" = aucun praticien choisi (état initial).
  const [resourceId, setResourceId] = useState<string>("");

  const resourceItems = resources.map((resource) => ({
    value: resource.id,
    label: resource.name,
  }));

  return (
    <div className="flex flex-col gap-6">
      <Field>
        <FieldLabel>Praticien</FieldLabel>
        <Select
          items={resourceItems}
          value={resourceId === "" ? null : resourceId}
          onValueChange={(value) => setResourceId(value ?? "")}
        >
          <SelectTrigger className="w-64" aria-label="Choisir un praticien">
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
      </Field>

      {resourceId === "" ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CalendarCog />
            </EmptyMedia>
            <EmptyTitle>Choisissez un praticien</EmptyTitle>
            <EmptyDescription>
              Sélectionnez un praticien pour régler sa semaine type et ses
              absences.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {/* key={resourceId} : changer de praticien remonte les deux
              sections (formulaires réinitialisés sur SES données). */}
          <WeeklyScheduleForm key={`schedule-${resourceId}`} resourceId={resourceId} />
          <ExceptionsSection key={`exceptions-${resourceId}`} resourceId={resourceId} />
        </>
      )}
    </div>
  );
}
