/**
 * Écran « Propriétaires » : tous les comptes du portail B2C.
 *
 * Variation du gabarit des cliniques (voir `clinics-content.tsx` pour le
 * partage des responsabilités). Deux différences, toutes deux volontaires :
 * il n'y a pas de bouton « nouveau propriétaire » — un client s'inscrit
 * lui-même, la console ne crée pas de compte à sa place — et l'état vide ne
 * propose donc aucune action de création.
 */
"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { UsersIcon } from "lucide-react";
import { useMemo } from "react";

import {
  colonnesProprietaires,
  TRIS_PROPRIETAIRES,
} from "@/components/owners/owners-columns";
import { DataTable } from "@/components/shared/data-table";
import { DataTableFilterSelect } from "@/components/shared/data-table-filter-select";
import { DataTableToolbar } from "@/components/shared/data-table-toolbar";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { useListAdminOwners } from "@/lib/api/generated/admin-owners/admin-owners";
import type {
  AdminOwnerSummary,
  OwnerSortField,
  SortDirection,
} from "@/lib/api/generated/vetoLibAPI.schemas";
import {
  FILTRE_TOUS,
  rechercheVersApi,
  statutVersApi,
} from "@/lib/table/filters";
import { useDebouncedSearch } from "@/lib/table/use-debounced-search";
import { useTableUrlState } from "@/lib/table/use-table-url-state";

const STATUTS = [
  { valeur: FILTRE_TOUS, libelle: "Tous les statuts" },
  { valeur: "active", libelle: "Actifs" },
  { valeur: "inactive", libelle: "Désactivés" },
] as const;

const VALEURS_STATUT = STATUTS.map((option) => option.valeur);

export function OwnersContent() {
  const etat = useTableUrlState({
    colonnesTriables: TRIS_PROPRIETAIRES,
    triParDefaut: "created_at",
    sensParDefaut: "desc",
  });
  const recherche = useDebouncedSearch(etat.q, etat.changerRecherche);
  const statut = etat.lireFiltre("statut", VALEURS_STATUT, FILTRE_TOUS);

  const liste = useListAdminOwners(
    {
      limit: etat.taille,
      offset: etat.offset,
      search: rechercheVersApi(etat.q),
      status: statutVersApi(statut),
      sort_by: etat.tri as OwnerSortField,
      sort_dir: etat.sens as SortDirection,
    },
    { query: { placeholderData: keepPreviousData } },
  );

  const colonnes = useMemo(() => colonnesProprietaires(etat), [etat]);
  const page = liste.data?.status === 200 ? liste.data.data : undefined;
  const donnees: AdminOwnerSummary[] = page?.items ?? [];

  return (
    <PageContainer>
      <PageHeader
        title="Propriétaires"
        description="Tous les comptes du portail propriétaires."
      />

      <DataTableToolbar
        recherche={recherche.valeur}
        onRechercheChange={recherche.changer}
        onEffacer={recherche.effacer}
        placeholder="Rechercher un nom, un email, une ville…"
      >
        <DataTableFilterSelect
          id="filtre-statut"
          label="Filtrer par statut"
          valeur={statut}
          options={STATUTS}
          onChange={(valeur) =>
            etat.changerFiltre("statut", valeur, FILTRE_TOUS)
          }
        />
      </DataTableToolbar>

      <DataTable
        columns={colonnes}
        donnees={donnees}
        total={page?.total ?? 0}
        etat={etat}
        isPending={liste.isPending}
        isPlaceholderData={liste.isPlaceholderData}
        isError={liste.isError}
        onRetry={() => void liste.refetch()}
        legende="Liste des propriétaires inscrits, paginée."
        erreurTitre="Impossible de charger les propriétaires"
        vide={{
          icon: <UsersIcon />,
          title:
            statut === FILTRE_TOUS
              ? "Aucun propriétaire inscrit"
              : "Aucun propriétaire dans ce statut",
          description:
            statut === FILTRE_TOUS
              ? "Les comptes apparaissent ici dès qu'un client s'inscrit sur le portail."
              : "Changez le filtre pour voir les autres comptes.",
        }}
        onEffacerRecherche={recherche.effacer}
        idLigne={(proprietaire) => proprietaire.id}
      />
    </PageContainer>
  );
}
