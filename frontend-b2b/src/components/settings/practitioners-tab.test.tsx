/**
 * Tests de l'onglet « Praticiens ».
 *
 * Un praticien ne se supprime jamais : il se désactive, parce que les
 * rendez-vous passés y font référence. La colonne « Statut » porte donc une
 * information de cycle de vie, pas un simple ornement — un praticien désactivé
 * disparaît de la prise de rendez-vous tout en restant dans l'historique.
 */
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PractitionersTab } from "@/components/settings/practitioners-tab";
import { buildResource } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ useListResources: vi.fn() }));

vi.mock("@/lib/api/generated/scheduling/scheduling", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/api/generated/scheduling/scheduling")
  >()),
  useListResources: simulations.useListResources,
}));

function requete(surcharges: Record<string, unknown> = {}) {
  return {
    data: undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    ...surcharges,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("PractitionersTab — états de la liste", () => {
  it("affiche des squelettes pendant le chargement", () => {
    simulations.useListResources.mockReturnValue(requete({ isPending: true }));
    renderWithProviders(<PractitionersTab />);

    expect(screen.getByText("Praticiens")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("permet de relancer après un échec", async () => {
    const refetch = vi.fn();
    simulations.useListResources.mockReturnValue(requete({ isError: true, refetch }));
    renderWithProviders(<PractitionersTab />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Réessayer" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("invite à créer le premier praticien", () => {
    simulations.useListResources.mockReturnValue(requete({ data: [] }));
    renderWithProviders(<PractitionersTab />);

    expect(screen.getByText("Aucun praticien")).toBeInTheDocument();
  });
});

describe("PractitionersTab — table", () => {
  it("affiche le nom et le statut", () => {
    simulations.useListResources.mockReturnValue(
      requete({ data: [buildResource({ id: "1", name: "Dr Martin" })] }),
    );
    renderWithProviders(<PractitionersTab />);

    const table = screen.getByRole("table");
    expect(within(table).getByText("Dr Martin")).toBeInTheDocument();
    expect(within(table).getByText("Actif")).toBeInTheDocument();
  });

  it("distingue un praticien désactivé", () => {
    // Il reste listé — les rendez-vous passés le référencent — mais il ne
    // doit pas être confondu avec un praticien réservable.
    simulations.useListResources.mockReturnValue(
      requete({
        data: [buildResource({ id: "1", name: "Dr Parti", active: false })],
      }),
    );
    renderWithProviders(<PractitionersTab />);

    expect(screen.getByText("Inactif")).toBeInTheDocument();
  });

  it("liste tous les praticiens", () => {
    simulations.useListResources.mockReturnValue(
      requete({
        data: [
          buildResource({ id: "1", name: "Dr Martin" }),
          buildResource({ id: "2", name: "Dr Leroy" }),
        ],
      }),
    );
    renderWithProviders(<PractitionersTab />);

    expect(screen.getAllByRole("row")).toHaveLength(3); // en-tête + 2 lignes
  });
});

describe("PractitionersTab — création et édition", () => {
  it("ouvre la création avec un formulaire vierge", async () => {
    simulations.useListResources.mockReturnValue(
      requete({ data: [buildResource({ name: "Dr Martin" })] }),
    );
    renderWithProviders(<PractitionersTab />);

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Nouveau praticien" }));

    const boite = await screen.findByRole("dialog");
    expect(within(boite).getByLabelText(/Nom/)).toHaveValue("");
  });

  it("ouvre l'édition préremplie", async () => {
    simulations.useListResources.mockReturnValue(
      requete({ data: [buildResource({ id: "1", name: "Dr Martin" })] }),
    );
    renderWithProviders(<PractitionersTab />);

    await userEvent.setup().click(screen.getByRole("button", { name: /Modifier/ }));

    const boite = await screen.findByRole("dialog");
    expect(within(boite).getByLabelText(/Nom/)).toHaveValue("Dr Martin");
  });

  it("repasse à un formulaire vierge après une édition", async () => {
    simulations.useListResources.mockReturnValue(
      requete({ data: [buildResource({ name: "Dr Martin" })] }),
    );
    renderWithProviders(<PractitionersTab />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Modifier/ }));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Nouveau praticien" }));
    const boite = await screen.findByRole("dialog");
    expect(within(boite).getByLabelText(/Nom/)).toHaveValue("");
  });
});
