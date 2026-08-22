/**
 * Tableau de bord de la console : les compteurs de la plateforme, puis les
 * derniers inscrits.
 *
 * Trois requêtes seulement, et c'est délibéré : UNE pour les six compteurs
 * (`getAdminStats`, qui les calcule en base plutôt que de faire compter le
 * front sur des listes tronquées), et deux listes de cinq lignes triées par
 * date de création décroissante. Les listes réutilisent les mêmes endpoints
 * paginés que les écrans complets, avec `limit: 5` — pas d'endpoint « les
 * derniers » à maintenir en plus.
 *
 * Ce que le tableau de bord ne fait PAS : afficher une donnée médicale, un
 * chiffre d'affaires, ou quoi que ce soit qui appartienne à une clinique en
 * particulier. Il compte des comptes.
 */
"use client";

import {
  BanIcon,
  Building2Icon,
  StethoscopeIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";

import { RecentCard } from "@/components/dashboard/recent-card";
import { StatCard } from "@/components/dashboard/stat-card";
import { ErrorState } from "@/components/shared/error-state";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { useListAdminClinics } from "@/lib/api/generated/admin-clinics/admin-clinics";
import { useListAdminOwners } from "@/lib/api/generated/admin-owners/admin-owners";
import { useGetAdminStats } from "@/lib/api/generated/admin-stats/admin-stats";
import { useCurrentAdmin } from "@/lib/auth/use-current-admin";

/** Paramètres communs aux deux listes « les cinq derniers ». */
const CINQ_DERNIERS = {
  limit: 5,
  offset: 0,
  sort_by: "created_at",
  sort_dir: "desc",
} as const;

export function DashboardContent() {
  const { data: admin } = useCurrentAdmin();
  const stats = useGetAdminStats();
  const cliniques = useListAdminClinics(CINQ_DERNIERS);
  const proprietaires = useListAdminOwners(CINQ_DERNIERS);

  const compteurs = stats.data?.status === 200 ? stats.data.data : undefined;
  const dernieresCliniques =
    cliniques.data?.status === 200 ? cliniques.data.data.items : [];
  const derniersProprietaires =
    proprietaires.data?.status === 200 ? proprietaires.data.data.items : [];

  // Un seul chiffre pour « ce qui est coupé » : trois compteurs séparés
  // obligeraient à les additionner de tête pour répondre à « est-ce que
  // quelque chose ne va pas ? ». Le détail est dans la précision.
  const suspendus =
    compteurs === undefined
      ? undefined
      : compteurs.suspended_clinics +
        compteurs.inactive_owners +
        compteurs.inactive_staff;

  return (
    <PageContainer>
      <PageHeader
        title="Console d'administration"
        description={
          admin === undefined
            ? "Vue d'ensemble de la plateforme VetoLib."
            : `Bonjour ${admin.first_name}. Vue d'ensemble de la plateforme VetoLib.`
        }
      />

      {stats.isError && (
        <ErrorState
          title="Impossible de charger les compteurs"
          onRetry={() => void stats.refetch()}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          titre="Cliniques"
          valeur={compteurs?.active_clinics}
          precision="Actives sur la plateforme"
          icon={Building2Icon}
          teinte="text-chart-1"
        />
        <StatCard
          titre="Propriétaires"
          valeur={compteurs?.active_owners}
          precision="Comptes actifs du portail B2C"
          icon={UsersIcon}
          teinte="text-chart-2"
        />
        <StatCard
          titre="Personnel"
          valeur={compteurs?.active_staff}
          precision="Comptes actifs, toutes cliniques"
          icon={StethoscopeIcon}
          teinte="text-chart-3"
        />
        <StatCard
          titre="Accès coupés"
          valeur={suspendus}
          precision={
            compteurs === undefined
              ? "Cliniques suspendues et comptes désactivés"
              : `${compteurs.suspended_clinics} cliniques, ${compteurs.inactive_owners} propriétaires, ${compteurs.inactive_staff} membres`
          }
          icon={BanIcon}
          teinte="text-chart-4"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RecentCard
          titre="Dernières cliniques"
          description="Les cinq inscriptions les plus récentes."
          enChargement={cliniques.isPending}
          hrefTout="/cliniques"
          messageVide="Aucune clinique inscrite pour l'instant."
          lignes={dernieresCliniques.map((clinique) => ({
            id: clinique.id,
            titre: (
              <Link
                href={`/cliniques/${clinique.id}`}
                className="underline-offset-4 hover:underline"
              >
                {clinique.name}
              </Link>
            ),
            sousTitre: clinique.city ?? clinique.email,
            date: clinique.created_at,
          }))}
        />
        <RecentCard
          titre="Derniers propriétaires"
          description="Les cinq inscriptions les plus récentes."
          enChargement={proprietaires.isPending}
          hrefTout="/proprietaires"
          messageVide="Aucun propriétaire inscrit pour l'instant."
          lignes={derniersProprietaires.map((proprietaire) => ({
            id: proprietaire.id,
            titre: `${proprietaire.first_name} ${proprietaire.last_name}`,
            sousTitre: proprietaire.email,
            date: proprietaire.created_at,
          }))}
        />
      </div>
    </PageContainer>
  );
}
