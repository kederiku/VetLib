/**
 * Écran Réglages : garde de permission + onglets de configuration.
 *
 * Réservé au gérant (clinic:manage). La garde affiche un état "accès
 * réservé" AU LIEU de rediriger : un ASV qui suit un lien /reglages
 * comprend pourquoi il ne voit rien (une redirection silencieuse vers le
 * dashboard serait déroutante). Rappel : cette garde est une commodité
 * d'UI — le backend renvoie 403 sur chaque endpoint de réglages si la
 * permission manque, c'est LUI la protection.
 */
"use client";

import { Lock } from "lucide-react";

import { ClinicForm } from "@/components/settings/clinic-form";
import { AppointmentTypesTab } from "@/components/settings/appointment-types-tab";
import { PractitionersTab } from "@/components/settings/practitioners-tab";
import { ScheduleTab } from "@/components/settings/schedule-tab";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useHasPermission } from "@/lib/auth/permissions";

export function SettingsContent() {
  const canManage = useHasPermission("clinic:manage");

  if (!canManage) {
    return (
      <div className="p-8">
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Lock />
            </EmptyMedia>
            <EmptyTitle>Accès réservé au gérant de la clinique</EmptyTitle>
            <EmptyDescription>
              Les réglages (fiche clinique, types de rendez-vous, praticiens,
              horaires) ne sont modifiables que par le gérant.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold tracking-tight">Réglages</h1>

      <Tabs defaultValue="clinic">
        <TabsList>
          <TabsTrigger value="clinic">Ma clinique</TabsTrigger>
          <TabsTrigger value="types">Types de rendez-vous</TabsTrigger>
          <TabsTrigger value="practitioners">Praticiens</TabsTrigger>
          <TabsTrigger value="schedule">Horaires</TabsTrigger>
        </TabsList>

        {/* Chaque onglet est un composant autonome : il porte ses propres
            queries/mutations et ne se charge qu'une fois affiché. */}
        <TabsContent value="clinic">
          <ClinicForm />
        </TabsContent>
        <TabsContent value="types">
          <AppointmentTypesTab />
        </TabsContent>
        <TabsContent value="practitioners">
          <PractitionersTab />
        </TabsContent>
        <TabsContent value="schedule">
          <ScheduleTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
