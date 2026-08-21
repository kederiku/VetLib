/**
 * Tests de l'onglet « Types de rendez-vous ».
 *
 * Ces types sont ce que les propriétaires voient au moment de réserver : les
 * désactiver les retire de la réservation en ligne sans casser les rendez-vous
 * passés qui y font référence. La colonne « Statut » est donc l'information la
 * plus utile de la table, et le remplacement du dialogue entre création et
 * édition le risque le plus concret — ouvrir la création préremplie du type
 * précédemment édité en créerait un doublon.
 */
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppointmentTypesTab } from "@/components/settings/appointment-types-tab";
import { buildAppointmentType } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ useListAppointmentTypes: vi.fn() }));

vi.mock("@/lib/api/generated/scheduling/scheduling", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/api/generated/scheduling/scheduling")
  >()),
  useListAppointmentTypes: simulations.useListAppointmentTypes,
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

describe("AppointmentTypesTab — états de la liste", () => {
  it("affiche des squelettes pendant le chargement", () => {
    simulations.useListAppointmentTypes.mockReturnValue(requete({ isPending: true }));
    renderWithProviders(<AppointmentTypesTab />);

    expect(screen.getByText("Types de rendez-vous")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("permet de relancer après un échec", async () => {
    const refetch = vi.fn();
    simulations.useListAppointmentTypes.mockReturnValue(
      requete({ isError: true, refetch }),
    );
    renderWithProviders(<AppointmentTypesTab />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Réessayer" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("invite à créer le premier type", () => {
    simulations.useListAppointmentTypes.mockReturnValue(requete({ data: [] }));
    renderWithProviders(<AppointmentTypesTab />);

    expect(screen.getByText("Aucun type de rendez-vous")).toBeInTheDocument();
  });
});

describe("AppointmentTypesTab — table", () => {
  it("affiche nom, durée et statut", () => {
    simulations.useListAppointmentTypes.mockReturnValue(
      requete({
        data: [
          buildAppointmentType({ id: "1", name: "Consultation", duration_minutes: 30 }),
        ],
      }),
    );
    renderWithProviders(<AppointmentTypesTab />);

    const table = screen.getByRole("table");
    expect(within(table).getByText("Consultation")).toBeInTheDocument();
    expect(within(table).getByText("30 min")).toBeInTheDocument();
    expect(within(table).getByText("Actif")).toBeInTheDocument();
  });

  it("distingue clairement un type désactivé", () => {
    // Un type inactif reste dans la table (les rendez-vous passés y font
    // référence) mais ne doit pas être confondu avec un type ouvert à la
    // réservation.
    simulations.useListAppointmentTypes.mockReturnValue(
      requete({
        data: [buildAppointmentType({ id: "1", name: "Ancien motif", active: false })],
      }),
    );
    renderWithProviders(<AppointmentTypesTab />);

    expect(screen.getByText("Inactif")).toBeInTheDocument();
  });

  it("liste tous les types", () => {
    simulations.useListAppointmentTypes.mockReturnValue(
      requete({
        data: [
          buildAppointmentType({ id: "1", name: "Consultation" }),
          buildAppointmentType({ id: "2", name: "Vaccination" }),
          buildAppointmentType({ id: "3", name: "Chirurgie" }),
        ],
      }),
    );
    renderWithProviders(<AppointmentTypesTab />);

    expect(screen.getAllByRole("row")).toHaveLength(4); // en-tête + 3 lignes
  });
});

describe("AppointmentTypesTab — création et édition", () => {
  it("ouvre la création avec un formulaire vierge", async () => {
    simulations.useListAppointmentTypes.mockReturnValue(
      requete({ data: [buildAppointmentType({ name: "Consultation" })] }),
    );
    renderWithProviders(<AppointmentTypesTab />);

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Nouveau type" }));

    const boite = await screen.findByRole("dialog");
    expect(within(boite).getByLabelText(/Nom/)).toHaveValue("");
  });

  it("ouvre l'édition préremplie", async () => {
    simulations.useListAppointmentTypes.mockReturnValue(
      requete({
        data: [
          buildAppointmentType({ id: "1", name: "Consultation", duration_minutes: 45 }),
        ],
      }),
    );
    renderWithProviders(<AppointmentTypesTab />);

    await userEvent.setup().click(screen.getByRole("button", { name: /Modifier/ }));

    const boite = await screen.findByRole("dialog");
    expect(within(boite).getByLabelText(/Nom/)).toHaveValue("Consultation");
  });

  it("repasse à un formulaire vierge après une édition", async () => {
    // Le risque concret : réutiliser le type précédemment édité créerait un
    // doublon au lieu d'un nouveau type.
    simulations.useListAppointmentTypes.mockReturnValue(
      requete({ data: [buildAppointmentType({ name: "Consultation" })] }),
    );
    renderWithProviders(<AppointmentTypesTab />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Modifier/ }));
    expect(within(await screen.findByRole("dialog")).getByLabelText(/Nom/)).toHaveValue(
      "Consultation",
    );
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Nouveau type" }));
    const boite = await screen.findByRole("dialog");
    expect(within(boite).getByLabelText(/Nom/)).toHaveValue("");
  });
});
