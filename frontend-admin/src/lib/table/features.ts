/**
 * Jeu de fonctionnalités TanStack Table partagé par TOUTES les datatables.
 *
 * TanStack Table v9 est FEATURE-BASED : on déclare une fois pour toutes ce
 * dont les tableaux ont besoin, et tout le reste est éliminé du paquet
 * final. Ce module est donc, littéralement, le budget fonctionnel des
 * tableaux de la console.
 *
 * Ce qu'on enregistre, et pourquoi si peu :
 *
 * - `rowSortingFeature` donne `column.getCanSort()`, `toggleSorting()`,
 *   `getIsSorted()` et l'état `sorting`. On n'enregistre PAS de
 *   `sortedRowModel` : le tri est fait par PostgreSQL (`manualSorting`), un
 *   modèle client retrierait les vingt lignes déjà triées ;
 * - `rowPaginationFeature` donne `getPageCount()`, `getCanNextPage()` et
 *   l'état `pagination`. Pas de `paginatedRowModel` non plus : le serveur a
 *   déjà découpé la page ;
 * - `columnMeta` est un SLOT DE TYPE (valeur fantôme, retirée à
 *   l'exécution) qui type `columnDef.meta`. C'est là que chaque colonne
 *   déclare sa largeur Tailwind, faute de quoi il faudrait enregistrer
 *   `columnSizingFeature` pour un besoin purement CSS.
 *
 * Volontairement ABSENTS : `columnVisibilityFeature` (aucun sélecteur de
 * colonnes dans ces écrans), `rowSelectionFeature` (aucune action de masse
 * — et une action de masse dans un back-office qui voit tous les tenants
 * mériterait sa propre réflexion), `columnFilteringFeature` (la recherche
 * est un paramètre global envoyé au serveur, elle n'entre jamais dans la
 * machinerie de filtrage du tableau).
 *
 * PIÈGE v9 à connaître : sans `columnVisibilityFeature`,
 * `row.getVisibleCells()` N'EXISTE PAS — il appartient à cette feature. Le
 * rendu utilise `row.getAllCells()`, qui est du coeur. Les exemples shadcn
 * montrent l'autre parce qu'ils enregistrent la visibilité : ne pas les
 * recopier tels quels.
 */
import {
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
} from "@tanstack/react-table";

/** Métadonnées de présentation portées par chaque colonne. */
export type AdminColumnMeta = {
  /**
   * Classes Tailwind appliquées à la fois au `<th>` ET aux `<td>` de la
   * colonne (largeur, alignement, troncature). Une seule déclaration : il
   * devient impossible que l'en-tête et le corps divergent.
   */
  className?: string;
};

export const ADMIN_TABLE_FEATURES = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  columnMeta: {} as AdminColumnMeta,
});

/** À passer en PREMIER paramètre générique de `ColumnDef` et de `Table`. */
export type AdminTableFeatures = typeof ADMIN_TABLE_FEATURES;
