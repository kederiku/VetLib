/**
 * Tableau de bord : la journée de la clinique en un écran.
 *
 * Trois blocs, tous dérivés de la MEME query agenda (voir
 * use-dashboard-agenda) : la liste chronologique du jour (2/3 de la
 * largeur), les demandes à confirmer avec actions directes, et la
 * répartition de la charge par praticien. L'ancienne carte "profil"
 * (permissions techniques en badges) a disparu : l'identité vit dans le
 * menu utilisateur du header.
 */
"use client";

import Link from "next/link";

import { PendingCard } from "@/components/dashboard/pending-card";
import { TodayByPractitioner } from "@/components/dashboard/today-by-practitioner";
import { TodaySection } from "@/components/dashboard/today-section";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { formatDayLong, parisToday, toParisDisplayDate } from "@/lib/date/format";

export function DashboardContent() {
  const { data: user } = useCurrentUser();

  // "Mercredi 20 août — Clinique du Parc" : Intl produit le jour en
  // minuscules, on capitalise la première lettre à la main (la
  // description du PageHeader est du texte, pas un élément stylable).
  const dayLabel = formatDayLong(toParisDisplayDate(parisToday()));
  const description = `${dayLabel.charAt(0).toUpperCase()}${dayLabel.slice(1)}${
    user !== undefined ? ` — ${user.clinic_name}` : ""
  }`;

  return (
    <PageContainer>
      <PageHeader
        title={user !== undefined ? `Bonjour, ${user.first_name}` : "Bonjour"}
        description={description}
        actions={
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/agenda" />}
          >
            Voir l&apos;agenda
          </Button>
        }
      />

      {/* 2/3 - 1/3 sur grand écran, empilé en dessous : la journée est
          la matière principale, la colonne droite le "cockpit". */}
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TodaySection />
        </div>
        <div className="flex flex-col gap-6">
          <PendingCard />
          <TodayByPractitioner />
        </div>
      </div>
    </PageContainer>
  );
}
