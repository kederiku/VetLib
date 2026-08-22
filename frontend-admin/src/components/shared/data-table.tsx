/**
 * Datatable générique de la console d'administration.
 *
 * Elle est PILOTÉE PAR LE SERVEUR de bout en bout : page courante, tri,
 * taille de page et recherche vivent dans l'URL, partent en paramètres de
 * requête, et le backend renvoie `{ items, total }`. TanStack Table n'est
 * donc utilisé que comme moteur de rendu et de définition de colonnes —
 * `manualPagination` et `manualSorting` lui disent « les données que tu
 * reçois sont déjà la bonne page, déjà triée : ne touche à rien ».
 *
 * Ce composant porte les quatre états d'une liste, et c'est tout son
 * intérêt : chaque écran les aurait sinon réécrits à sa façon.
 *
 * - CHARGEMENT : des squelettes DANS le tableau, en nombre égal à la taille
 *   de page, en-tête compris. La mise en page ne bouge donc pas quand les
 *   données arrivent.
 * - ERREUR : `ErrorState`, avec son bouton « Réessayer » obligatoire.
 * - VIDE : deux états DISTINCTS. « Aucune donnée » propose de créer ;
 *   « aucun résultat pour X » propose d'effacer la recherche. Réutiliser le
 *   premier pour le second est un contresens fréquent — le ton engageant
 *   d'un premier usage n'a aucun sens quand on a juste filtré trop fin.
 * - DONNÉES : le tableau.
 */
"use client";

import { type ColumnDef, type RowData, useTable } from "@tanstack/react-table";
import type { ReactNode } from "react";

import { DataTablePagination } from "@/components/shared/data-table-pagination";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ADMIN_TABLE_FEATURES,
  type AdminTableFeatures,
} from "@/lib/table/features";
import { ariaSortPourColonne } from "@/lib/table/format";
import type { TableUrlState } from "@/lib/table/use-table-url-state";
import { cn } from "@/lib/utils";

/** Contenu de l'état vide « il n'y a rien », par opposition à « rien ne correspond ». */
export type EtatVide = {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
};

// TData est contraint par RowData (Record<string, any> | any[]), la
// contrainte que TanStack impose a ses generiques. Nos lignes sont des
// objets issus d'Orval : elles la satisfont naturellement.
export type DataTableProps<TData extends RowData> = {
  columns: ColumnDef<AdminTableFeatures, TData>[];
  donnees: TData[];
  total: number;
  etat: TableUrlState;
  isPending: boolean;
  /** Vrai pendant qu'une page suivante charge, l'ancienne restant affichée. */
  isPlaceholderData?: boolean;
  isError: boolean;
  onRetry: () => void;
  /** Résumé lu par les lecteurs d'écran (TableCaption, visuellement masqué). */
  legende: string;
  erreurTitre: string;
  vide: EtatVide;
  onEffacerRecherche: () => void;
  idLigne: (donnee: TData) => string;
};

export function DataTable<TData extends RowData>({
  columns,
  donnees,
  total,
  etat,
  isPending,
  isPlaceholderData = false,
  isError,
  onRetry,
  legende,
  erreurTitre,
  vide,
  onEffacerRecherche,
  idLigne,
}: DataTableProps<TData>) {
  const table = useTable<AdminTableFeatures, TData>({
    features: ADMIN_TABLE_FEATURES,
    columns,
    data: donnees,
    getRowId: idLigne,
    // Le serveur a déjà trié et découpé : on le dit à la table, sinon elle
    // retrierait la page en mémoire (et le tri porterait alors sur vingt
    // lignes au lieu de la table entière -- un faux tri, très convaincant).
    manualSorting: true,
    manualPagination: true,
    rowCount: total,
    state: {
      sorting: [{ id: etat.tri, desc: etat.sens === "desc" }],
      pagination: { pageIndex: etat.page - 1, pageSize: etat.taille },
    },
    // TanStack avertit en console quand on contrôle un état sans fournir son
    // `on...Change`. Les deux chemins convergent de toute façon vers l'URL.
    onSortingChange: () => undefined,
    onPaginationChange: () => undefined,
  });

  if (isError) {
    return <ErrorState title={erreurTitre} onRetry={onRetry} />;
  }

  // Vide APRÈS chargement seulement : pendant le chargement, `donnees` est
  // vide aussi, et afficher « aucun résultat » puis les lignes ferait
  // clignoter un message faux.
  if (!isPending && total === 0) {
    return etat.q === "" ? (
      <EmptyState
        icon={vide.icon}
        title={vide.title}
        description={vide.description}
        action={vide.action}
      />
    ) : (
      <EmptyState
        icon={vide.icon}
        title={`Aucun résultat pour « ${etat.q} »`}
        description="Vérifiez l'orthographe, ou élargissez votre recherche."
        action={
          <Button variant="outline" onClick={onEffacerRecherche}>
            Effacer la recherche
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          {/* Résumé pour les lecteurs d'écran : un tableau sans légende est
              annoncé « tableau, 6 colonnes » et rien de plus. */}
          <TableCaption className="sr-only">{legende}</TableCaption>
          <TableHeader>
            {table.getHeaderGroups().map((groupe) => (
              <TableRow key={groupe.id}>
                {groupe.headers.map((entete) => {
                  const triable = entete.column.getCanSort();
                  const triee = etat.tri === entete.column.id;
                  return (
                    <TableHead
                      key={entete.id}
                      className={entete.column.columnDef.meta?.className}
                      aria-sort={ariaSortPourColonne(triable, triee, etat.sens)}
                    >
                      {entete.isPlaceholder ? null : (
                        <table.FlexRender header={entete} />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody
            // Pendant le chargement d'une page suivante, l'ancienne reste
            // affichée (keepPreviousData) : on la grise plutôt que de la
            // remplacer par des squelettes, ce qui ferait sauter l'écran.
            className={cn(isPlaceholderData && "opacity-60 transition-opacity")}
          >
            {isPending
              ? Array.from({ length: etat.taille }, (_, index) => (
                  <TableRow key={`squelette-${index}`}>
                    {columns.map((colonne, indexColonne) => (
                      <TableCell
                        key={`squelette-cellule-${indexColonne}`}
                        className={colonne.meta?.className}
                      >
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : table.getRowModel().rows.map((ligne) => (
                  <TableRow key={ligne.id}>
                    {/* getAllCells et NON getVisibleCells : ce dernier
                        appartient a columnVisibilityFeature, que l'on
                        n'enregistre pas (voir lib/table/features.ts). */}
                    {ligne.getAllCells().map((cellule) => (
                      <TableCell
                        key={cellule.id}
                        className={cellule.column.columnDef.meta?.className}
                      >
                        <table.FlexRender cell={cellule} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>

      <DataTablePagination
        etat={etat}
        total={total}
        affichees={donnees.length}
        enChargement={isPending || isPlaceholderData}
      />
    </div>
  );
}
