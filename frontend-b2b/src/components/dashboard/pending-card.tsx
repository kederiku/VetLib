/**
 * Carte "À confirmer" du tableau de bord — avec actions DIRECTES.
 *
 * L'ancienne carte listait les rendez-vous en attente sans permettre
 * d'agir : il fallait ouvrir l'agenda et retrouver la ligne. Ici,
 * confirmer ou annuler se fait dans la carte (l'action la plus
 * fréquente de l'accueil au réveil : traiter les demandes arrivées du
 * portail B2C pendant la nuit). Les mutations viennent du hook partagé
 * use-appointment-transitions (toasts + invalidation inclus), le dialog
 * d'annulation est le composant commun de l'agenda.
 */
"use client";

import Link from "next/link";
import { useState } from "react";

import { CancelAppointmentDialog } from "@/components/agenda/cancel-appointment-dialog";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { AgendaEntryResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import { formatClientName } from "@/lib/appointments/status";
import { formatDayShort, formatTime } from "@/lib/date/format";
import { useAppointmentTransitions } from "@/lib/scheduling/use-appointment-transitions";
import { useDashboardAgenda } from "@/lib/scheduling/use-dashboard-agenda";

// Aperçu volontairement court : le tableau de bord signale, l'agenda
// traite. Au-delà, le lien "Voir l'agenda" prend le relais.
const PREVIEW_COUNT = 5;

export function PendingCard() {
  const { isPending, isError, refetch, pendingNext7 } = useDashboardAgenda();
  const transitions = useAppointmentTransitions();
  // Rendez-vous en cours d'annulation : un SEUL dialog pour la carte,
  // ouvert sur l'entrée cliquée (plutôt qu'un dialog par ligne).
  const [entryToCancel, setEntryToCancel] = useState<AgendaEntryResponse | null>(
    null,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>À confirmer</CardTitle>
        <CardDescription>
          Demandes en attente sur les 7 prochains jours.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isPending && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        )}

        {isError && (
          <ErrorState
            title="Impossible de charger les rendez-vous en attente."
            onRetry={refetch}
          />
        )}

        {pendingNext7 !== undefined && pendingNext7.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aucun rendez-vous en attente. Tout est à jour.
          </p>
        )}

        {pendingNext7 !== undefined && pendingNext7.length > 0 && (
          <ul className="flex flex-col gap-2.5">
            {pendingNext7.slice(0, PREVIEW_COUNT).map((entry) => (
              <li key={entry.id} className="flex flex-col gap-1.5">
                <div className="text-sm">
                  <span className="font-medium tabular-nums first-letter:uppercase">
                    {formatDayShort(entry.starts_at)} · {formatTime(entry.starts_at)}
                  </span>
                  <span className="text-muted-foreground">
                    {" — "}
                    {formatClientName(entry)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="xs"
                    disabled={transitions.isBusy}
                    onClick={() => void transitions.confirm(entry.id)}
                  >
                    {transitions.isConfirming && <Spinner data-icon="inline-start" />}
                    Confirmer
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    className="text-muted-foreground"
                    disabled={transitions.isBusy}
                    onClick={() => setEntryToCancel(entry)}
                  >
                    Annuler
                  </Button>
                </div>
              </li>
            ))}
            {pendingNext7.length > PREVIEW_COUNT && (
              <li className="text-xs text-muted-foreground">
                et {pendingNext7.length - PREVIEW_COUNT} autre(s) dans
                l&apos;agenda...
              </li>
            )}
          </ul>
        )}

        <div>
          {/* Base UI n'a pas asChild : render={<Link/>} substitue le
              lien Next.js au bouton en conservant style et clavier. */}
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href="/agenda" />}
          >
            Voir l&apos;agenda
          </Button>
        </div>
      </CardContent>

      {entryToCancel !== null && (
        <CancelAppointmentDialog
          entry={entryToCancel}
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setEntryToCancel(null);
            }
          }}
        />
      )}
    </Card>
  );
}
