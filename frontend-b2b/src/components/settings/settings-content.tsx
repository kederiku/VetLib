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

import { LockIcon } from "lucide-react";
import Link from "next/link";

import { ClinicForm } from "@/components/settings/clinic-form";
import { AppointmentTypesTab } from "@/components/settings/appointment-types-tab";
import { PractitionersTab } from "@/components/settings/practitioners-tab";
import { ScheduleTab } from "@/components/settings/schedule-tab";
import { EmptyState } from "@/components/shared/empty-state";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
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
      <PageContainer width="narrow">
        <EmptyState
          icon={<LockIcon />}
          title="Accès réservé au gérant de la clinique"
          description="Les réglages (fiche clinique, types de rendez-vous, praticiens, horaires) ne sont modifiables que par le gérant."
          action={
            // L'impasse doit proposer une sortie : retour à l'écran
            // accessible à tous les rôles.
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/dashboard" />}
            >
              Retour au tableau de bord
            </Button>
          }
        />
      </PageContainer>
    );
  }

  return (
    // Largeur "narrow" : les réglages sont des formulaires, une colonne
    // étroite reste plus lisible que la pleine largeur des écrans denses.
    <PageContainer width="narrow">
      <PageHeader
        title="Réglages"
        description="Fiche clinique, types de rendez-vous, praticiens et horaires."
      />

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
    </PageContainer>
  );
}
