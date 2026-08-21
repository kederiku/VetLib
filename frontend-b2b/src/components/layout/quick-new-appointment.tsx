/**
 * CTA global "Nouveau rendez-vous" du header.
 *
 * La prise de rendez-vous est L'ACTION du produit : elle doit être
 * accessible depuis n'importe quel écran, pas seulement depuis la barre
 * d'outils de l'agenda. Ce composant porte ses propres requêtes
 * praticiens/types avec exactement les mêmes options que l'écran Agenda :
 * mêmes queryKeys TanStack, donc cache partagé — si l'agenda est déjà
 * passé par là, aucune requête supplémentaire ne part.
 */
"use client";

import { PlusIcon } from "lucide-react";
import { useState } from "react";

import { NewAppointmentDialog } from "@/components/agenda/new-appointment-dialog";
import { Button } from "@/components/ui/button";
import {
  useListAppointmentTypes,
  useListResources,
} from "@/lib/api/generated/scheduling/scheduling";

export function QuickNewAppointment() {
  const [dialogOpen, setDialogOpen] = useState(false);
  // key du dialog : incrémentée à chaque ouverture pour REMONTER le
  // composant, donc repartir d'un formulaire vierge (pas de reset manuel).
  const [dialogKey, setDialogKey] = useState(0);

  // Praticiens et types ACTIFS uniquement : les inactifs ne prennent
  // plus de nouveaux rendez-vous. Mêmes select que l'agenda (cache
  // partagé, voir la docstring du module).
  const resourcesQuery = useListResources({
    query: { select: (res) => res.data.filter((r) => r.active) },
  });
  const typesQuery = useListAppointmentTypes({
    query: { select: (res) => res.data.filter((t) => t.active) },
  });

  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          setDialogKey((key) => key + 1);
          setDialogOpen(true);
        }}
      >
        <PlusIcon data-icon="inline-start" />
        Nouveau rendez-vous
      </Button>
      <NewAppointmentDialog
        key={dialogKey}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        resources={resourcesQuery.data ?? []}
        appointmentTypes={typesQuery.data ?? []}
      />
    </>
  );
}
