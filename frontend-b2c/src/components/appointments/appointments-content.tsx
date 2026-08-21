/**
 * Contenu de la page /rendez-vous : tous mes rendez-vous, toutes
 * cliniques confondues.
 *
 * Deux sections : "À venir" (tri chronologique ascendant — le prochain
 * d'abord) et "Passés" (descendant — le plus recent d'abord). Le partage
 * se fait sur starts_at par rapport a MAINTENANT, pas sur le statut : un
 * rendez-vous futur ANNULE reste dans "À venir" avec son badge (le
 * proprietaire doit voir que son creneau de jeudi est tombe), simplement
 * sans bouton d'annulation.
 *
 * Client Component : useListMyAppointments (cache partage avec l'apercu
 * de /mon-compte, meme queryKey).
 */
"use client";

import { CalendarDays, Plus } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { AppointmentCard } from "@/components/appointments/appointment-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyAppointments } from "@/lib/appointments/use-my-appointments";

export function AppointmentsContent() {
  const {
    data: appointments,
    isPending,
    isError,
    refetch,
  } = useMyAppointments();

  // "Maintenant" est fige PAR RENDU (pas par carte) : toutes les cartes
  // et le partage a-venir/passe utilisent le meme instant, pas de
  // rendez-vous a cheval entre deux sections.
  const now = useMemo(() => new Date(), []);

  // Partage et tris derives de la liste : recalcules uniquement quand la
  // donnee change (useMemo), jamais stockes en etat local (une seule
  // source de verite : le cache TanStack Query).
  const { upcoming, past } = useMemo(() => {
    const all = appointments ?? [];
    const nowMs = now.getTime();
    const upcomingList = all
      .filter((appt) => new Date(appt.starts_at).getTime() > nowMs)
      .sort(
        (a, b) =>
          new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
      );
    const pastList = all
      .filter((appt) => new Date(appt.starts_at).getTime() <= nowMs)
      .sort(
        (a, b) =>
          new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime(),
      );
    return { upcoming: upcomingList, past: pastList };
  }, [appointments, now]);

  return (
    <PageContainer>
      <PageHeader
        title="Mes rendez-vous"
        description="Vos visites vétérinaires, toutes cliniques confondues."
        actions={
          <Button
            nativeButton={false}
            render={<Link href="/rendez-vous/nouveau" />}
          >
            <Plus data-icon="inline-start" aria-hidden />
            Prendre rendez-vous
          </Button>
        }
      />

      {isPending && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {/* Erreur AVEC issue : l'ancien bandeau n'offrait aucun moyen de
          relancer, il fallait recharger la page à la main. */}
      {isError && (
        <ErrorState
          title="Impossible de charger vos rendez-vous."
          onRetry={() => void refetch()}
        />
      )}

      {/* Etat vide global : aucun rendez-vous, passe comme a venir. */}
      {appointments !== undefined && appointments.length === 0 && (
        <EmptyState
          icon={<CalendarDays aria-hidden />}
          title="Aucun rendez-vous pour l'instant"
          description="Choisissez une clinique, un motif et un créneau : votre demande part en quelques clics."
          action={
            <Button
              nativeButton={false}
              render={<Link href="/rendez-vous/nouveau" />}
            >
              <Plus data-icon="inline-start" aria-hidden />
              Prendre rendez-vous
            </Button>
          }
        />
      )}

      {appointments !== undefined && appointments.length > 0 && (
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold tracking-tight">À venir</h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun rendez-vous à venir.
              </p>
            ) : (
              upcoming.map((appt) => (
                <AppointmentCard key={appt.id} appointment={appt} now={now} />
              ))
            )}
          </section>

          <Separator />

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold tracking-tight">Passés</h2>
            {past.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun rendez-vous passé.
              </p>
            ) : (
              past.map((appt) => (
                <AppointmentCard key={appt.id} appointment={appt} now={now} />
              ))
            )}
          </section>
        </div>
      )}
    </PageContainer>
  );
}
