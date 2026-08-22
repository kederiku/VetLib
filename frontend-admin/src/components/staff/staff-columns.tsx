/**
 * Colonnes de la liste du personnel.
 *
 * Une seule définition pour DEUX écrans : la liste transverse
 * `/personnel`, et la carte « Personnel » de la fiche d'une clinique. Le
 * paramètre `avecClinique` retire la colonne Clinique dans le second cas —
 * y répéter cent fois le même nom de clinique serait du bruit.
 *
 * `TRIS_PERSONNEL` et `TRIS_PERSONNEL_CLINIQUE` sont les listes blanches
 * correspondantes, exportées ici pour rester d'accord avec les colonnes (un
 * test le vérifie). Elles reproduisent l'enum `StaffSortField` du backend.
 */
"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import { StatusBadge } from "@/components/shared/status-badge";
import { StaffRowActions } from "@/components/staff/staff-row-actions";
import { DataTableColumnHeader } from "@/components/shared/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import type { AdminStaffSummary } from "@/lib/api/generated/vetoLibAPI.schemas";
import { formatDateCourte } from "@/lib/date/format";
import { ROLE_LABELS } from "@/lib/staff/roles";
import type { AdminTableFeatures } from "@/lib/table/features";
import type { TableUrlState } from "@/lib/table/use-table-url-state";

/**
 * Colonnes triables de la liste transverse.
 *
 * Sous-ensemble de l'enum `StaffSortField`, qui accepte aussi `email` :
 * aucune colonne ne l'affiche comme champ propre (voir
 * `clinics-columns.tsx`).
 */
export const TRIS_PERSONNEL = [
  "last_name",
  "role",
  "clinic_name",
  "created_at",
] as const;

/** Idem sur la fiche d'une clinique, où la colonne Clinique n'existe pas. */
export const TRIS_PERSONNEL_CLINIQUE = TRIS_PERSONNEL.filter(
  (colonne) => colonne !== "clinic_name",
);

export function colonnesPersonnel(
  etat: TableUrlState,
  options: { avecClinique: boolean },
): ColumnDef<AdminTableFeatures, AdminStaffSummary>[] {
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

  const colonneClinique: ColumnDef<AdminTableFeatures, AdminStaffSummary> = {
    id: "clinic_name",
    accessorKey: "clinic_name",
    header: entete("clinic_name", "Clinique"),
    meta: { className: "min-w-48" },
    cell: ({ row }) => (
      <Link
        href={`/cliniques/${row.original.clinic_id}`}
        className="underline-offset-4 hover:underline"
      >
        {row.original.clinic_name}
      </Link>
    ),
  };

  return [
    {
      id: "last_name",
      accessorKey: "last_name",
      header: entete("last_name", "Membre"),
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
    ...(options.avecClinique ? [colonneClinique] : []),
    {
      id: "role",
      accessorKey: "role",
      header: entete("role", "Rôle"),
      meta: { className: "w-32" },
      cell: ({ row }) => (
        <Badge variant="outline">{ROLE_LABELS[row.original.role]}</Badge>
      ),
    },
    {
      id: "is_active",
      accessorKey: "is_active",
      header: "Statut",
      enableSorting: false,
      meta: { className: "w-40" },
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge actif={row.original.is_active} libelleActif="Actif" />
          {/* Un compte actif dans une clinique suspendue ne peut PAS se
              connecter : sans cette mention, la ligne dirait « Actif » et
              l'exploitant chercherait longtemps pourquoi la personne se
              plaint de ne pas entrer. */}
          {!row.original.clinic_is_active && (
            <span className="text-xs text-muted-foreground">
              Clinique suspendue
            </span>
          )}
        </div>
      ),
    },
    {
      id: "created_at",
      accessorKey: "created_at",
      header: entete("created_at", "Créé le"),
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
      cell: ({ row }) => <StaffRowActions membre={row.original} />,
    },
  ];
}
