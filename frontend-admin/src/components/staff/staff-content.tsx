/**
 * Écran « Personnel » : les comptes de TOUTES les cliniques, dans une seule
 * liste.
 *
 * C'est la vue qui justifie le mieux la lecture inter-tenant du back-office :
 * répondre à « où travaille cette personne ? » ou « combien de gérants avons
 * -nous ? » demanderait, sans elle, d'ouvrir les cliniques une par une.
 *
 * Deux filtres au lieu d'un : statut ET rôle. Il n'y a volontairement pas de
 * filtre « clinique » — l'endpoint le supporte (`clinic_id`), mais la fiche
 * d'une clinique porte déjà sa propre liste de personnel, et un second
 * chemin vers la même donnée n'apporterait qu'une divergence à entretenir.
 */
"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { StethoscopeIcon } from "lucide-react";
import { useMemo } from "react";

import { DataTable } from "@/components/shared/data-table";
import { DataTableFilterSelect } from "@/components/shared/data-table-filter-select";
import { DataTableToolbar } from "@/components/shared/data-table-toolbar";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import {
  colonnesPersonnel,
  TRIS_PERSONNEL,
} from "@/components/staff/staff-columns";
import { useListAdminStaff } from "@/lib/api/generated/admin-staff/admin-staff";
import type {
  AdminStaffSummary,
  SortDirection,
  StaffSortField,
} from "@/lib/api/generated/vetoLibAPI.schemas";
import { ROLE_OPTIONS } from "@/lib/staff/roles";
import {
  FILTRE_TOUS,
  rechercheVersApi,
  roleVersApi,
  statutVersApi,
} from "@/lib/table/filters";
import { useDebouncedSearch } from "@/lib/table/use-debounced-search";
import { useTableUrlState } from "@/lib/table/use-table-url-state";

const STATUTS = [
  { valeur: FILTRE_TOUS, libelle: "Tous les statuts" },
  { valeur: "active", libelle: "Actifs" },
  { valeur: "inactive", libelle: "Désactivés" },
] as const;

/** Les rôles du contrat, préfixés de « tous » : une seule source, `ROLE_OPTIONS`. */
const ROLES = [
  { valeur: FILTRE_TOUS, libelle: "Tous les rôles" },
  ...ROLE_OPTIONS.map((option) => ({
    valeur: option.value,
    libelle: option.label,
  })),
];

const VALEURS_STATUT = STATUTS.map((option) => option.valeur);
const VALEURS_ROLE = ROLES.map((option) => option.valeur);

export function StaffContent() {
  const etat = useTableUrlState({
    colonnesTriables: TRIS_PERSONNEL,
    triParDefaut: "last_name",
  });
  const recherche = useDebouncedSearch(etat.q, etat.changerRecherche);
  const statut = etat.lireFiltre("statut", VALEURS_STATUT, FILTRE_TOUS);
  const role = etat.lireFiltre("role", VALEURS_ROLE, FILTRE_TOUS);

  const liste = useListAdminStaff(
    {
      limit: etat.taille,
      offset: etat.offset,
      search: rechercheVersApi(etat.q),
      status: statutVersApi(statut),
      role: roleVersApi(role),
      sort_by: etat.tri as StaffSortField,
      sort_dir: etat.sens as SortDirection,
    },
    { query: { placeholderData: keepPreviousData } },
  );

  const colonnes = useMemo(
    () => colonnesPersonnel(etat, { avecClinique: true }),
    [etat],
  );
  const page = liste.data?.status === 200 ? liste.data.data : undefined;
  const donnees: AdminStaffSummary[] = page?.items ?? [];
  const filtre = statut !== FILTRE_TOUS || role !== FILTRE_TOUS;

  return (
    <PageContainer>
      <PageHeader
        title="Personnel"
        description="Les comptes du personnel de toutes les cliniques."
      />

      <DataTableToolbar
        recherche={recherche.valeur}
        onRechercheChange={recherche.changer}
        onEffacer={recherche.effacer}
        placeholder="Rechercher un nom, un email, une clinique…"
      >
        <DataTableFilterSelect
          id="filtre-role"
          label="Filtrer par rôle"
          valeur={role}
          options={ROLES}
          onChange={(valeur) => etat.changerFiltre("role", valeur, FILTRE_TOUS)}
        />
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
        legende="Liste du personnel de toutes les cliniques, paginée."
        erreurTitre="Impossible de charger le personnel"
        vide={{
          icon: <StethoscopeIcon />,
          title: filtre
            ? "Aucun compte pour ces filtres"
            : "Aucun compte du personnel",
          description: filtre
            ? "Élargissez les filtres pour voir les autres comptes."
            : "Les comptes se créent depuis la fiche d'une clinique, ou par les gérants depuis leur portail.",
        }}
        onEffacerRecherche={recherche.effacer}
        idLigne={(membre) => membre.id}
      />
    </PageContainer>
  );
}
