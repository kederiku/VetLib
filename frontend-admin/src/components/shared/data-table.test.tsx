/**
 * Tests de la datatable générique.
 *
 * On teste les COMPORTEMENTS risqués, pas le rendu ligne à ligne :
 *
 * - les quatre états (chargement, erreur, deux états vides, données), parce
 *   qu'ils sont mutuellement exclusifs et qu'une condition mal ordonnée fait
 *   afficher « aucun résultat » pendant le chargement ;
 * - `aria-sort`, seul indicateur du sens de tri pour un lecteur d'écran ;
 * - le clic sur un en-tête, qui doit demander un tri à l'URL et non trier
 *   les vingt lignes déjà reçues.
 *
 * Les colonnes sont définies ICI, minimales : les vraies colonnes montent
 * des menus d'actions et des dialogues, hors sujet pour ce composant.
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DataTable } from "@/components/shared/data-table";
import { DataTableColumnHeader } from "@/components/shared/data-table-column-header";
import type { AdminTableFeatures } from "@/lib/table/features";
import type { TableUrlState } from "@/lib/table/use-table-url-state";
import { buildClinicSummary, buildTableUrlState } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

type Ligne = ReturnType<typeof buildClinicSummary>;

function colonnes(etat: TableUrlState) {
  function EnteteNom() {
    return (
      <DataTableColumnHeader
        titre="Clinique"
        triee={etat.tri === "name"}
        sens={etat.sens}
        onTrier={() => etat.changerTri("name")}
      />
    );
  }
  return [
    {
      id: "name",
      accessorKey: "name",
      header: EnteteNom,
      meta: { className: "min-w-64" },
      cell: ({ row }: { row: { original: Ligne } }) => row.original.name,
    },
    {
      id: "city",
      accessorKey: "city",
      header: "Ville",
      enableSorting: false,
      meta: { className: "w-40" },
      cell: ({ row }: { row: { original: Ligne } }) => row.original.city ?? "—",
    },
  ] as import("@tanstack/react-table").ColumnDef<AdminTableFeatures, Ligne>[];
}

function afficher(
  surcharges: Partial<React.ComponentProps<typeof DataTable<Ligne>>> = {},
) {
  const etat =
    surcharges.etat ?? buildTableUrlState({ tri: "name", sens: "asc" });
  const donnees = surcharges.donnees ?? [
    buildClinicSummary({ id: "c1", name: "Clinique des Lilas", city: "Paris" }),
    buildClinicSummary({ id: "c2", name: "Clinique du Parc", city: "Lyon" }),
  ];
  return renderWithProviders(
    <DataTable<Ligne>
      columns={colonnes(etat)}
      donnees={donnees}
      total={donnees.length}
      isPending={false}
      isError={false}
      onRetry={vi.fn()}
      legende="Liste des cliniques, paginée."
      erreurTitre="Impossible de charger les cliniques"
      vide={{ icon: <span />, title: "Aucune clinique inscrite" }}
      onEffacerRecherche={vi.fn()}
      idLigne={(ligne) => ligne.id}
      {...surcharges}
      // Après la diffusion : `etat` est résolu plus haut (défaut ou
      // surcharge), et les deux branches doivent atterrir sur la MÊME
      // instance que celle passée aux colonnes.
      etat={etat}
    />,
  );
}

describe("DataTable — les quatre états", () => {
  it("affiche des squelettes pendant le chargement, en gardant l'en-tête", () => {
    // Les squelettes sont DANS le tableau : la mise en page ne bouge pas
    // quand les données arrivent.
    afficher({ isPending: true, donnees: [], total: 0 });

    expect(
      screen.getByRole("columnheader", { name: /clinique/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Aucune clinique inscrite"),
    ).not.toBeInTheDocument();
  });

  it("affiche l'erreur avec un bouton Réessayer, et rien d'autre", () => {
    const onRetry = vi.fn();
    afficher({ isError: true, onRetry });

    expect(
      screen.getByText("Impossible de charger les cliniques"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Réessayer" }),
    ).toBeInTheDocument();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("distingue « aucune donnée » de « aucun résultat pour la recherche »", async () => {
    const utilisateur = userEvent.setup();
    const onEffacerRecherche = vi.fn();

    const { unmount } = afficher({ donnees: [], total: 0 });
    expect(screen.getByText("Aucune clinique inscrite")).toBeInTheDocument();
    unmount();

    afficher({
      donnees: [],
      total: 0,
      etat: buildTableUrlState({ q: "lilas" }),
      onEffacerRecherche,
    });
    // Ton et issue différents : ici on ne propose pas de créer, on propose
    // d'élargir la recherche.
    expect(screen.getByText(/Aucun résultat pour/)).toHaveTextContent("lilas");
    await utilisateur.click(
      screen.getByRole("button", { name: "Effacer la recherche" }),
    );
    expect(onEffacerRecherche).toHaveBeenCalledOnce();
  });

  it("affiche les lignes reçues du serveur", () => {
    afficher();
    expect(screen.getByText("Clinique des Lilas")).toBeInTheDocument();
    expect(screen.getByText("Clinique du Parc")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3); // en-tête + 2 lignes
  });
});

describe("DataTable — tri", () => {
  it("annonce le sens du tri sur la colonne triée, et « none » sur les autres", () => {
    afficher({ etat: buildTableUrlState({ tri: "name", sens: "desc" }) });

    expect(
      screen.getByRole("columnheader", { name: /clinique/i }),
    ).toHaveAttribute("aria-sort", "descending");
    // La colonne Ville n'est pas triable : elle ne porte aucun aria-sort,
    // ce qui n'est pas la même chose que « none ».
    expect(
      screen.getByRole("columnheader", { name: "Ville" }),
    ).not.toHaveAttribute("aria-sort");
  });

  it("demande le tri à l'URL au lieu de retrier la page en mémoire", async () => {
    const utilisateur = userEvent.setup();
    const etat = buildTableUrlState({ tri: "name", sens: "asc" });
    afficher({ etat });

    await utilisateur.click(screen.getByRole("button", { name: /clinique/i }));

    // C'est tout l'enjeu de `manualSorting` : trier les vingt lignes reçues
    // donnerait un tri convaincant et FAUX (il ne porterait pas sur la table
    // entière). L'ordre des lignes affichées ne bouge donc pas.
    expect(etat.changerTri).toHaveBeenCalledWith("name");
    const lignes = screen.getAllByRole("row").slice(1);
    expect(lignes[0]).toHaveTextContent("Clinique des Lilas");
  });
});

describe("DataTable — pagination", () => {
  it("annonce la plage affichée dans une région vivante", () => {
    afficher({ total: 137, etat: buildTableUrlState({ page: 2, offset: 20 }) });

    // role="status" : un changement de page ne déplace pas le focus, c'est
    // le seul moyen pour un lecteur d'écran d'apprendre que ça a changé.
    expect(screen.getByRole("status")).toHaveTextContent("21");
    expect(screen.getByRole("status")).toHaveTextContent("137");
  });

  it("désactive « précédent » sur la première page", () => {
    afficher({ total: 137 });
    expect(
      screen.getByRole("button", { name: "Page précédente" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Page suivante" })).toBeEnabled();
  });
});
