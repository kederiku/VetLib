/**
 * Écran « Cliniques » : la liste paginée de TOUTES les cliniques du parc.
 *
 * C'est le gabarit dont les écrans Propriétaires et Personnel sont des
 * variations. Le partage des responsabilités y est le suivant, et il est
 * volontairement strict :
 *
 * - l'ÉTAT (page, recherche, tri, filtre) vit dans l'URL, via
 *   `useTableUrlState` — ce composant n'a aucun `useState` de filtrage ;
 * - la REQUÊTE est une simple projection de cet état en paramètres. Aucun
 *   filtrage, aucun tri, aucun découpage en mémoire : le serveur fait tout,
 *   sinon « trier par nom » ne trierait que les vingt lignes visibles ;
 * - le RENDU (quatre états, pagination, colonnes) appartient à `DataTable`.
 *
 * Il ne reste donc ici que ce qui est propre aux cliniques : les colonnes,
 * le filtre de statut, l'état vide et le dialogue de création.
 */
"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { Building2Icon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { ClinicCreateDialog } from "@/components/clinics/clinic-create-dialog";
import {
  colonnesCliniques,
  TRIS_CLINIQUES,
} from "@/components/clinics/clinics-columns";
import { DataTable } from "@/components/shared/data-table";
import { DataTableFilterSelect } from "@/components/shared/data-table-filter-select";
import { DataTableToolbar } from "@/components/shared/data-table-toolbar";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { useListAdminClinics } from "@/lib/api/generated/admin-clinics/admin-clinics";
import type {
  AdminClinicSummary,
  ClinicSortField,
  SortDirection,
} from "@/lib/api/generated/vetoLibAPI.schemas";
import {
  FILTRE_TOUS,
  rechercheVersApi,
  statutVersApi,
} from "@/lib/table/filters";
import { useDebouncedSearch } from "@/lib/table/use-debounced-search";
import { useTableUrlState } from "@/lib/table/use-table-url-state";

/** Options du filtre de statut. « tous » = paramètre absent de la requête. */
const STATUTS = [
  { valeur: FILTRE_TOUS, libelle: "Tous les statuts" },
  { valeur: "active", libelle: "Actives" },
  { valeur: "inactive", libelle: "Suspendues" },
] as const;

const VALEURS_STATUT = STATUTS.map((option) => option.valeur);

export function ClinicsContent() {
  const etat = useTableUrlState({
    colonnesTriables: TRIS_CLINIQUES,
    // Les dernières inscrites en tête : c'est ce qu'on vient vérifier le
    // plus souvent dans une console d'exploitation.
    triParDefaut: "created_at",
    sensParDefaut: "desc",
  });
  const recherche = useDebouncedSearch(etat.q, etat.changerRecherche);
  const [creationOuverte, setCreationOuverte] = useState(false);

  const statut = etat.lireFiltre("statut", VALEURS_STATUT, FILTRE_TOUS);

  const liste = useListAdminClinics(
    {
      limit: etat.taille,
      offset: etat.offset,
      search: rechercheVersApi(etat.q),
      status: statutVersApi(statut),
      sort_by: etat.tri as ClinicSortField,
      sort_dir: etat.sens as SortDirection,
    },
    {
      query: {
        // Sans cela, chaque changement de page vide le tableau le temps de
        // l'aller-retour : la page « saute », et la barre de pagination se
        // déplace sous le curseur qui vient de cliquer.
        placeholderData: keepPreviousData,
      },
    },
  );

  const colonnes = useMemo(() => colonnesCliniques(etat), [etat]);
  const page = liste.data?.status === 200 ? liste.data.data : undefined;
  const donnees: AdminClinicSummary[] = page?.items ?? [];

  return (
    <PageContainer>
      <PageHeader
        title="Cliniques"
        description="Toutes les cliniques inscrites sur la plateforme."
        actions={
          <Button onClick={() => setCreationOuverte(true)}>
            <PlusIcon aria-hidden />
            Nouvelle clinique
          </Button>
        }
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
        legende="Liste des cliniques inscrites, paginée."
        erreurTitre="Impossible de charger les cliniques"
        vide={{
          icon: <Building2Icon />,
          title:
            statut === FILTRE_TOUS
              ? "Aucune clinique inscrite"
              : "Aucune clinique dans ce statut",
          description:
            statut === FILTRE_TOUS
              ? "Créez la première clinique et son gérant."
              : "Changez le filtre pour voir les autres cliniques.",
          action:
            statut === FILTRE_TOUS ? (
              <Button onClick={() => setCreationOuverte(true)}>
                <PlusIcon aria-hidden />
                Nouvelle clinique
              </Button>
            ) : undefined,
        }}
        onEffacerRecherche={recherche.effacer}
        idLigne={(clinique) => clinique.id}
      />

      <ClinicCreateDialog
        open={creationOuverte}
        onOpenChange={setCreationOuverte}
      />
    </PageContainer>
  );
}
