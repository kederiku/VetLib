/**
 * Contenu du tableau de bord : la page d'atterrissage du portail.
 *
 * Avant cette refonte, se connecter menait droit à une liste. Cette page
 * répond d'abord à la question qu'on se pose en arrivant — « qu'est-ce
 * qui m'attend ? » — puis donne les deux raccourcis utiles : mes
 * animaux, et compléter mon profil s'il est incomplet.
 *
 * CE QU'ON N'Y MET PAS, volontairement : aucun compteur façon tableau de
 * pilotage (« 3 animaux », « 2 rendez-vous ») — un propriétaire ne gère
 * pas une flotte, et compter ce qu'il voit d'un coup d'oeil est du
 * remplissage ; aucun graphique (il n'existe aucune série temporelle
 * utile à un particulier) ; aucun mini-calendrier (il ferait doublon
 * avec l'étape 4 du tunnel, sans les disponibilités, et un calendrier
 * vide est pire qu'aucun calendrier).
 *
 * « Maintenant » est figé PAR RENDU et partagé par toutes les cartes :
 * la frontière futur / passé ne doit pas bouger d'une carte à l'autre.
 */
"use client";

import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { NextAppointmentCard } from "@/components/dashboard/next-appointment-card";
import { PetsSummaryCard } from "@/components/dashboard/pets-summary-card";
import { ProfileCompletionCard } from "@/components/dashboard/profile-completion-card";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { formatDateLong } from "@/lib/date/format";

export function DashboardContent() {
  const { data: owner } = useCurrentUser();
  const now = useMemo(() => new Date(), []);

  // « Jeudi 20 août 2026 » : Intl produit le jour en minuscules, on
  // capitalise la première lettre à la main (la description du
  // PageHeader est du texte, pas un élément stylable).
  const jour = formatDateLong(now.toISOString());
  const description = `${jour.charAt(0).toUpperCase()}${jour.slice(1)}`;

  return (
    <PageContainer>
      <PageHeader
        title={owner !== undefined ? `Bonjour, ${owner.first_name}` : "Bonjour"}
        description={description}
        actions={
          <Button
            nativeButton={false}
            render={<Link href="/rendez-vous/nouveau" />}
          >
            <PlusIcon data-icon="inline-start" aria-hidden />
            Prendre rendez-vous
          </Button>
        }
      />

      {/* 3/5 - 2/5 sur grand écran, empilé en dessous : le prochain
          rendez-vous reste la matière principale, mais la colonne de
          droite avait besoin de plus que le tiers d'origine -- sous
          270 px, "Prochain rendez-vous : 22 août 2026" ne tenait pas sur
          une ligne. L'ordre empilé sur mobile (rendez-vous, profil,
          animaux) est déjà le bon ordre de priorité.

          Réserve connue : les points de rupture Tailwind se calculent
          sur la FENETRE, pas sur la place réellement disponible. A
          exactement 1024 px avec la sidebar dépliée (qui en consomme
          256), la colonne retombe sous ce seuil et la sous-ligne repasse
          sur deux lignes -- elle reste lue en entier, c'est l'absence de
          `truncate` qui le garantit. */}
      <div className="grid items-start gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <NextAppointmentCard now={now} />
        </div>
        <div className="flex flex-col gap-6 lg:col-span-2">
          <ProfileCompletionCard />
          <PetsSummaryCard now={now} />
        </div>
      </div>
    </PageContainer>
  );
}
