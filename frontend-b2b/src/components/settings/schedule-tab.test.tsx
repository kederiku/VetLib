/**
 * Tests de l'onglet « Horaires ».
 *
 * Les horaires appartiennent à UN praticien : l'onglet impose donc de le
 * choisir avant d'afficher quoi que ce soit. Sans cette étape, on risquerait
 * d'éditer la semaine du mauvais praticien — une erreur invisible qui ne se
 * révélerait qu'aux premières réservations mal placées.
 *
 * Le sélecteur ne propose que les praticiens ACTIFS : configurer les horaires
 * d'un praticien parti n'a pas de sens.
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ScheduleTab } from "@/components/settings/schedule-tab";
import { buildResource } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ useListResources: vi.fn() }));

vi.mock("@/lib/api/generated/scheduling/scheduling", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/api/generated/scheduling/scheduling")
  >()),
  useListResources: simulations.useListResources,
}));

// La semaine type a ses propres tests : on la remplace pour n'éprouver ici
// que le choix du praticien.
vi.mock("@/components/settings/weekly-schedule-form", () => ({
  WeeklyScheduleForm: ({ resourceId }: { resourceId: string }) => (
    <div>Semaine de {resourceId}</div>
  ),
}));

/**
 * Le composant applique un `select` qui ne garde que les praticiens actifs.
 * Simuler le hook court-circuite ce filtre : on renvoie donc la donnée déjà
 * filtrée, comme le ferait le hook réel.
 */
function requete(data: unknown[] | undefined) {
  return { data, isPending: false, isError: false, refetch: vi.fn() };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("ScheduleTab", () => {
  it("demande de choisir un praticien avant tout", () => {
    // Éditer « la » semaine sans savoir de qui mènerait à configurer le
    // mauvais agenda.
    simulations.useListResources.mockReturnValue(
      requete([buildResource({ id: "r1", name: "Dr Martin" })]),
    );
    renderWithProviders(<ScheduleTab />);

    expect(screen.getByText("Choisissez un praticien")).toBeInTheDocument();
    expect(screen.queryByText(/Semaine de/)).not.toBeInTheDocument();
  });

  it("liste les praticiens proposés", async () => {
    simulations.useListResources.mockReturnValue(
      requete([
        buildResource({ id: "r1", name: "Dr Martin" }),
        buildResource({ id: "r2", name: "Dr Leroy" }),
      ]),
    );
    renderWithProviders(<ScheduleTab />);

    await userEvent
      .setup()
      .click(screen.getByRole("combobox", { name: "Choisir un praticien" }));

    expect(await screen.findByRole("option", { name: "Dr Martin" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Dr Leroy" })).toBeInTheDocument();
  });

  it("affiche la semaine du praticien choisi", async () => {
    simulations.useListResources.mockReturnValue(
      requete([
        buildResource({ id: "r1", name: "Dr Martin" }),
        buildResource({ id: "r2", name: "Dr Leroy" }),
      ]),
    );
    renderWithProviders(<ScheduleTab />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("combobox", { name: "Choisir un praticien" }));
    await user.click(await screen.findByRole("option", { name: "Dr Leroy" }));

    // L'identifiant transmis doit être celui du praticien SÉLECTIONNÉ.
    expect(await screen.findByText("Semaine de r2")).toBeInTheDocument();
  });

  it("ne plante pas avant le chargement des praticiens", () => {
    simulations.useListResources.mockReturnValue(requete(undefined));
    renderWithProviders(<ScheduleTab />);

    expect(screen.getByText("Choisissez un praticien")).toBeInTheDocument();
  });
});
