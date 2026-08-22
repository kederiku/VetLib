/**
 * Colonnes de la liste des propriétaires.
 *
 * Même forme que celles des cliniques : des données pures, définies au
 * niveau module, avec la liste blanche de tri exportée à côté pour qu'un
 * test puisse vérifier qu'elles restent d'accord.
 *
 * Le nombre d'animaux n'est PAS un lien : la console ne donne accès ni aux
 * fiches animales ni aux rendez-vous. Elle administre des comptes, pas des
 * dossiers de soins.
 */
"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { OwnerRowActions } from "@/components/owners/owner-row-actions";
import { DataTableColumnHeader } from "@/components/shared/data-table-column-header";
import { StatusBadge } from "@/components/shared/status-badge";
import type { AdminOwnerSummary } from "@/lib/api/generated/vetoLibAPI.schemas";
import { formatDateCourte } from "@/lib/date/format";
import type { AdminTableFeatures } from "@/lib/table/features";
import type { TableUrlState } from "@/lib/table/use-table-url-state";

/**
 * Colonnes triables PROPOSÉES PAR CET ÉCRAN.
 *
 * L'enum `OwnerSortField` du backend accepte aussi `email`, mais aucune
 * colonne ne l'affiche comme champ propre : aucun en-tête ne peut donc
 * basculer ce tri (voir `clinics-columns.tsx` pour le raisonnement complet).
 */
export const TRIS_PROPRIETAIRES = ["last_name", "created_at"] as const;

export function colonnesProprietaires(
  etat: TableUrlState,
): ColumnDef<AdminTableFeatures, AdminOwnerSummary>[] {
  // Fabrique d'en-tetes triables. La fonction rendue est NOMMEE (et non une
  // flechee anonyme) : TanStack la traite comme un composant, et un
  // composant sans nom n'apparait pas dans React DevTools -- ce que la regle
  // react/display-name signale a juste titre.
  const entete = (id: string, titre: string) => {
    function EnteteTriable() {
      return (
        <DataTableColumnHeader
          titre={titre}
          triee={etat.tri === id}
          sens={etat.sens}
          onTrier={() => etat.changerTri(id)}
        />
      );
    }
    return EnteteTriable;
  };

  return [
    {
      id: "last_name",
      accessorKey: "last_name",
      header: entete("last_name", "Propriétaire"),
      meta: { className: "min-w-64" },
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">
            {row.original.first_name} {row.original.last_name}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {row.original.email}
          </span>
        </div>
      ),
    },
    {
      id: "phone",
      accessorKey: "phone",
      header: "Téléphone",
      // Non triable : absent de l'enum OwnerSortField du backend. Le rendre
      // cliquable ici produirait un tri silencieusement ignoré.
      enableSorting: false,
      meta: { className: "w-40" },
      cell: ({ row }) => row.original.phone ?? "—",
    },
    {
      id: "city",
      accessorKey: "city",
      header: "Ville",
      enableSorting: false,
      meta: { className: "w-40" },
      cell: ({ row }) => row.original.city ?? "—",
    },
    {
      id: "pet_count",
      accessorKey: "pet_count",
      header: "Animaux",
      enableSorting: false,
      meta: { className: "w-24 text-right" },
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.pet_count}</span>
      ),
    },
    {
      id: "is_active",
      accessorKey: "is_active",
      header: "Statut",
      enableSorting: false,
      meta: { className: "w-32" },
      cell: ({ row }) => <StatusBadge actif={row.original.is_active} />,
    },
    {
      id: "created_at",
      accessorKey: "created_at",
      header: entete("created_at", "Inscrit le"),
      meta: { className: "w-32" },
      cell: ({ row }) => (
        <span className="tabular-nums">
          {formatDateCourte(row.original.created_at)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      enableSorting: false,
      meta: { className: "w-12 text-right" },
      cell: ({ row }) => <OwnerRowActions proprietaire={row.original} />,
    },
  ];
}
