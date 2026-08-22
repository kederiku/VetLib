/**
 * Carte « Personnel » de la fiche d'une clinique.
 *
 * C'est la même datatable que l'écran `/personnel`, avec deux différences :
 * elle est filtrée sur une clinique par le chemin de l'endpoint
 * (`/admin/clinics/{id}/staff`), et la colonne Clinique en est retirée.
 *
 * Elle partage l'état d'URL de la page : la fiche n'a qu'un seul tableau,
 * `?page=2&tri=role` y est donc sans ambiguïté. Le jour où une seconde
 * table apparaîtrait sur cette page, il faudrait préfixer les paramètres —
 * la remarque est ici pour que ce ne soit pas découvert par un bug.
 */
"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { PlusIcon, StethoscopeIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { DataTable } from "@/components/shared/data-table";
import { DataTableToolbar } from "@/components/shared/data-table-toolbar";
import {
  colonnesPersonnel,
  TRIS_PERSONNEL_CLINIQUE,
} from "@/components/staff/staff-columns";
import { StaffCreateDialog } from "@/components/staff/staff-create-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useListAdminClinicStaff } from "@/lib/api/generated/admin-clinics/admin-clinics";
import type {
  AdminStaffSummary,
  SortDirection,
  StaffSortField,
} from "@/lib/api/generated/vetoLibAPI.schemas";
import { rechercheVersApi } from "@/lib/table/filters";
import { useDebouncedSearch } from "@/lib/table/use-debounced-search";
import { useTableUrlState } from "@/lib/table/use-table-url-state";

export function ClinicStaffCard({
  clinicId,
  clinicName,
}: {
  clinicId: string;
  clinicName: string;
}) {
  const etat = useTableUrlState({
    colonnesTriables: TRIS_PERSONNEL_CLINIQUE,
    triParDefaut: "last_name",
  });
  const recherche = useDebouncedSearch(etat.q, etat.changerRecherche);
  const [creationOuverte, setCreationOuverte] = useState(false);

  const liste = useListAdminClinicStaff(
    clinicId,
    {
      limit: etat.taille,
      offset: etat.offset,
      search: rechercheVersApi(etat.q),
      sort_by: etat.tri as StaffSortField,
      sort_dir: etat.sens as SortDirection,
    },
    { query: { placeholderData: keepPreviousData } },
  );

  const colonnes = useMemo(
    () => colonnesPersonnel(etat, { avecClinique: false }),
    [etat],
  );
  const page = liste.data?.status === 200 ? liste.data.data : undefined;
  const donnees: AdminStaffSummary[] = page?.items ?? [];

  const ajouter = (
    <Button size="sm" onClick={() => setCreationOuverte(true)}>
      <PlusIcon aria-hidden />
      Ajouter un membre
    </Button>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personnel</CardTitle>
        <CardDescription>
          Les comptes rattachés à cette clinique, actifs comme désactivés.
        </CardDescription>
        <CardAction>{ajouter}</CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <DataTableToolbar
          recherche={recherche.valeur}
          onRechercheChange={recherche.changer}
          onEffacer={recherche.effacer}
          placeholder="Rechercher un nom, un email…"
        />
        <DataTable
          columns={colonnes}
          donnees={donnees}
          total={page?.total ?? 0}
          etat={etat}
          isPending={liste.isPending}
          isPlaceholderData={liste.isPlaceholderData}
          isError={liste.isError}
          onRetry={() => void liste.refetch()}
          legende={`Personnel de ${clinicName}, paginé.`}
          erreurTitre="Impossible de charger le personnel"
          vide={{
            icon: <StethoscopeIcon />,
            title: "Aucun compte pour cette clinique",
            description:
              "Créez un gérant : il pourra ensuite ajouter lui-même son équipe depuis son portail.",
            action: ajouter,
          }}
          onEffacerRecherche={recherche.effacer}
          idLigne={(membre) => membre.id}
        />
      </CardContent>

      <StaffCreateDialog
        clinicId={clinicId}
        clinicName={clinicName}
        open={creationOuverte}
        onOpenChange={setCreationOuverte}
      />
    </Card>
  );
}
