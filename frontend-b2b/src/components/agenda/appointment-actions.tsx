/**
 * Menu d'actions d'un rendez-vous (transitions de la machine à états),
 * pour les LIGNES de liste (section "Aujourd'hui" du tableau de bord).
 *
 * Les actions proposées découlent STRICTEMENT de l'état courant :
 * pending -> Confirmer / Annuler ; confirmed -> Terminer / Annuler ;
 * completed et cancelled sont des états finaux (pas de menu du tout).
 * La logique vit dans use-appointment-transitions (toasts + invalidation)
 * et le dialog d'annulation dans cancel-appointment-dialog : ce
 * composant n'est plus que le déclencheur compact en bout de ligne. La
 * grille agenda, elle, montre les mêmes actions en boutons directs dans
 * le détail d'un bloc (appointment-details.tsx).
 */
"use client";

import { MoreHorizontalIcon } from "lucide-react";
import { useState } from "react";

import { CancelAppointmentDialog } from "@/components/agenda/cancel-appointment-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import type { AgendaEntryResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import { useAppointmentTransitions } from "@/lib/scheduling/use-appointment-transitions";

export function AppointmentActions({ entry }: { entry: AgendaEntryResponse }) {
  const transitions = useAppointmentTransitions();
  const [cancelOpen, setCancelOpen] = useState(false);

  // États finaux : rien à faire, pas de menu (plutôt qu'un menu vide).
  if (entry.status !== "pending" && entry.status !== "confirmed") {
    return null;
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Actions sur le rendez-vous"
              disabled={transitions.isBusy}
            />
          }
        >
          {transitions.isBusy ? <Spinner /> : <MoreHorizontalIcon />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {entry.status === "pending" && (
            <DropdownMenuItem onClick={() => void transitions.confirm(entry.id)}>
              Confirmer
            </DropdownMenuItem>
          )}
          {entry.status === "confirmed" && (
            <DropdownMenuItem onClick={() => void transitions.complete(entry.id)}>
              Terminer
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setCancelOpen(true)}
          >
            Annuler
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CancelAppointmentDialog
        entry={entry}
        open={cancelOpen}
        onOpenChange={setCancelOpen}
      />
    </div>
  );
}
