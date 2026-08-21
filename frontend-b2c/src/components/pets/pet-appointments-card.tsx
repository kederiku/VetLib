/**
 * Carte « Ses rendez-vous » de la fiche animal.
 *
 * Entièrement DERIVEE du cache : la liste complète des rendez-vous est
 * déjà chargée et porte pet_id, il n'y a donc ni endpoint ni paramètre
 * de filtre à demander au backend. Une seule queryKey, une seule
 * invalidation — annuler un rendez-vous rafraîchit cet écran aussi.
 *
 * Deux sections chronologiques plutôt que des onglets : sur la fiche
 * d'UN animal, le volume est faible et c'est la vue complète qui
 * intéresse. Les onglets ont leur place sur la page « Mes rendez-vous »,
 * où l'historique de tous les animaux s'accumule.
 */
"use client";

import { CalendarDaysIcon } from "lucide-react";
import Link from "next/link";

import { AppointmentRow } from "@/components/appointments/appointment-row";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { OwnerAppointmentResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import { forPet, splitByTime } from "@/lib/appointments/derive";
import { cn } from "@/lib/utils";

// Apercu volontairement court : la fiche SIGNALE, la page "Mes
// rendez-vous" traite. Au-dela, le lien vers l'historique filtre prend
// le relais.
const APERCU_PASSES = 5;

interface PetAppointmentsCardProps {
  appointments: readonly OwnerAppointmentResponse[] | undefined;
  petId: string;
  petName: string;
  now: Date;
  className?: string;
}

export function PetAppointmentsCard({
  appointments,
  petId,
  petName,
  now,
  className,
}: PetAppointmentsCardProps) {
  const { upcoming, past } = splitByTime(
    forPet(appointments ?? [], petId),
    now,
  );
  const passesAffiches = past.slice(0, APERCU_PASSES);

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>Ses rendez-vous</CardTitle>
        <CardDescription>
          Les visites vétérinaires de {petName}, toutes cliniques confondues.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        {upcoming.length === 0 && past.length === 0 ? (
          // Pas de CTA ici : l'en-tete de la fiche porte deja
          // "Prendre rendez-vous", vers la MEME adresse. Deux boutons
          // identiques sur un ecran seraient annonces deux fois par un
          // lecteur d'ecran, pour une seule action possible.
          <EmptyState
            className=""
            icon={<CalendarDaysIcon aria-hidden />}
            title={`Aucun rendez-vous pour ${petName}`}
            description="Sa première visite s'organise en quelques clics, depuis le bouton en haut de cette page."
          />
        ) : (
          <>
            {upcoming.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-medium text-muted-foreground">
                  À venir
                </h2>
                {upcoming.map((appt) => (
                  <AppointmentRow key={appt.id} appointment={appt} dense />
                ))}
              </section>
            )}

            {past.length > 0 && (
              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-medium text-muted-foreground">
                  Passés
                </h2>
                {passesAffiches.map((appt) => (
                  <AppointmentRow key={appt.id} appointment={appt} dense />
                ))}
              </section>
            )}
          </>
        )}
      </CardContent>

      {/* Le lien mene a l'ecran deja filtre sur cet animal : c'est
          precisement ce que permet l'etat d'URL de la page. */}
      {past.length > passesAffiches.length && (
        <CardFooter>
          <Button
            variant="link"
            size="sm"
            className="px-0"
            nativeButton={false}
            render={<Link href={`/rendez-vous?vue=passes&animal=${petId}`} />}
          >
            Voir tout son historique ({past.length})
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
