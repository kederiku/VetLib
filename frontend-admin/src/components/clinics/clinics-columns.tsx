/**
 * Colonnes de la liste des cliniques.
 *
 * Définies au niveau MODULE, hors du composant : ce sont des données pures,
 * donc testables comme telles — et non recréées à chaque rendu, ce qui
 * ferait remonter tout le tableau.
 *
 * `TRIS_CLINIQUES` est exporté d'ici, à côté des colonnes, et pas ailleurs.
 * C'est volontaire : la liste blanche de tri et les colonnes triables
 * doivent rester d'accord, et un test vérifie qu'elles le sont. Les séparer
 * garantirait qu'un jour elles divergent, en silence — une colonne triable
 * dont le tri retomberait sur le défaut sans que personne ne le remarque.
 */
"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import { ClinicRowActions } from "@/components/clinics/clinic-row-actions";
import { DataTableColumnHeader } from "@/components/shared/data-table-column-header";
import { StatusBadge } from "@/components/shared/status-badge";
import type { AdminClinicSummary } from "@/lib/api/generated/vetoLibAPI.schemas";
import { formatDateCourte } from "@/lib/date/format";
import type { AdminTableFeatures } from "@/lib/table/features";
import type { TableUrlState } from "@/lib/table/use-table-url-state";

/**
 * Colonnes triables PROPOSÉES PAR CET ÉCRAN.
 *
 * Sous-ensemble de l'enum `ClinicSortField` du backend, qui accepte aussi
 * `email` : aucune colonne n'affiche l'email comme champ propre (il est en
 * seconde ligne de la colonne Clinique), donc aucun en-tête ne peut basculer
 * ce tri. Le laisser dans la liste blanche autoriserait un `?tri=email` que
 * l'interface serait ensuite incapable d'afficher comme actif — un état
 * invisible, exactement ce qu'un tri ne doit pas être. Un test vérifie que
 * cette liste est EXACTEMENT l'ensemble des colonnes triables ci-dessous.
 */
export const TRIS_CLINIQUES = ["name", "city", "created_at"] as const;

export function colonnesCliniques(
  etat: TableUrlState,
): ColumnDef<AdminTableFeatures, AdminClinicSummary>[] {
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
      id: "name",
      accessorKey: "name",
      header: entete("name", "Clinique"),
      meta: { className: "min-w-64" },
      cell: ({ row }) => (
        <div className="flex flex-col">
          {/* La ligne entière n'est pas un lien : elle contient un menu
              d'actions, et imbriquer un bouton dans un lien produit du HTML
              invalide et une navigation clavier ambiguë. Le nom porte donc
              seul le lien vers la fiche. */}
          <Link
            href={`/cliniques/${row.original.id}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {row.original.name}
          </Link>
          <span className="truncate text-xs text-muted-foreground">
            {row.original.email}
          </span>
        </div>
      ),
    },
    {
      id: "city",
      accessorKey: "city",
      header: entete("city", "Ville"),
      meta: { className: "w-40" },
      // Tiret cadratin plutôt que case vide : une cellule vide se lit comme
      // un bug d'affichage, un tiret se lit comme « non renseigné ».
      cell: ({ row }) => row.original.city ?? "—",
    },
    {
      id: "staff_count",
      accessorKey: "staff_count",
      header: "Personnel",
      // Non triable : le compte vient d'une sous-requête, et trier dessus
      // demanderait de la faire entrer dans l'ORDER BY. À faire le jour où
      // quelqu'un le demandera, pas avant.
      enableSorting: false,
      meta: { className: "w-28 text-right" },
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.staff_count}</span>
      ),
    },
    {
      id: "is_active",
      accessorKey: "is_active",
      header: "Statut",
      enableSorting: false,
      meta: { className: "w-32" },
      cell: ({ row }) => (
        <StatusBadge
          actif={row.original.is_active}
          libelleActif="Active"
          libelleInactif="Suspendue"
        />
      ),
    },
    {
      id: "created_at",
      accessorKey: "created_at",
      header: entete("created_at", "Inscrite le"),
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
      cell: ({ row }) => <ClinicRowActions clinique={row.original} />,
    },
  ];
}
