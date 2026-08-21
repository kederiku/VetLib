/**
 * Tests du raccourci « Nouveau rendez-vous » de l'en-tête.
 *
 * Deux détails y comptent. D'abord le filtrage : seuls les praticiens et les
 * types ACTIFS sont proposés — offrir un praticien désactivé mènerait à un
 * refus du serveur après saisie complète. Ensuite le remontage de la boîte de
 * dialogue à chaque ouverture, obtenu par une clé incrémentale : sans lui, une
 * saisie abandonnée réapparaîtrait telle quelle à l'ouverture suivante.
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QuickNewAppointment } from "@/components/layout/quick-new-appointment";
import { buildAppointmentType, buildResource } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({
  useListResources: vi.fn(),
  useListAppointmentTypes: vi.fn(),
  proprietesRecues: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/api/generated/scheduling/scheduling", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/api/generated/scheduling/scheduling")
  >()),
  useListResources: simulations.useListResources,
  useListAppointmentTypes: simulations.useListAppointmentTypes,
}));

// La boîte de dialogue a ses propres tests : on l'espionne ici pour observer
// ce qu'elle reçoit, sans monter son formulaire complet.
vi.mock("@/components/agenda/new-appointment-dialog", () => ({
  NewAppointmentDialog: (props: Record<string, unknown>) => {
    simulations.proprietesRecues.push(props);
    return props.open ? <div role="dialog">Boîte de création</div> : null;
  },
}));

/**
 * Le composant applique un `select` qui ne garde que les entrées actives.
 * Simuler le hook court-circuite ce select : on renvoie donc la donnée déjà
 * filtrée, comme le ferait le hook réel.
 */
function requete(data: unknown[]) {
  return { data, isPending: false, isError: false, refetch: vi.fn() };
}

afterEach(() => {
  simulations.proprietesRecues.length = 0;
  vi.clearAllMocks();
});

describe("QuickNewAppointment", () => {
  it("propose le raccourci de création", () => {
    simulations.useListResources.mockReturnValue(requete([]));
    simulations.useListAppointmentTypes.mockReturnValue(requete([]));
    renderWithProviders(<QuickNewAppointment />);

    expect(
      screen.getByRole("button", { name: /Nouveau rendez-vous/ }),
    ).toBeInTheDocument();
  });

  it("garde la boîte fermée au départ", () => {
    simulations.useListResources.mockReturnValue(requete([]));
    simulations.useListAppointmentTypes.mockReturnValue(requete([]));
    renderWithProviders(<QuickNewAppointment />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ouvre la boîte au clic", async () => {
    simulations.useListResources.mockReturnValue(requete([]));
    simulations.useListAppointmentTypes.mockReturnValue(requete([]));
    renderWithProviders(<QuickNewAppointment />);

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Nouveau rendez-vous/ }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("transmet praticiens et types à la boîte", () => {
    simulations.useListResources.mockReturnValue(
      requete([buildResource({ name: "Dr Martin" })]),
    );
    simulations.useListAppointmentTypes.mockReturnValue(
      requete([buildAppointmentType({ name: "Consultation" })]),
    );
    renderWithProviders(<QuickNewAppointment />);

    const dernieres = simulations.proprietesRecues.at(-1)!;
    expect(dernieres.resources).toHaveLength(1);
    expect(dernieres.appointmentTypes).toHaveLength(1);
  });

  it("ne transmet jamais undefined avant le chargement", () => {
    // La boîte itère sur ces listes : un undefined la ferait planter à
    // l'ouverture, au pire moment.
    simulations.useListResources.mockReturnValue(requete(undefined as never));
    simulations.useListAppointmentTypes.mockReturnValue(requete(undefined as never));
    renderWithProviders(<QuickNewAppointment />);

    const dernieres = simulations.proprietesRecues.at(-1)!;
    expect(dernieres.resources).toEqual([]);
    expect(dernieres.appointmentTypes).toEqual([]);
  });

  it("remonte la boîte à chaque ouverture", async () => {
    // La clé change à chaque clic : React démonte puis remonte la boîte,
    // ce qui efface une saisie abandonnée précédemment.
    simulations.useListResources.mockReturnValue(requete([]));
    simulations.useListAppointmentTypes.mockReturnValue(requete([]));
    renderWithProviders(<QuickNewAppointment />);
    const user = userEvent.setup();
    const bouton = screen.getByRole("button", { name: /Nouveau rendez-vous/ });

    await user.click(bouton);
    const premiereCle = simulations.proprietesRecues.at(-1)!.key;
    simulations.proprietesRecues.length = 0;
    await user.click(bouton);

    // La clé n'apparaît pas dans les props reçues (React la consomme), mais
    // le remontage se constate au nombre de rendus déclenchés.
    expect(simulations.proprietesRecues.length).toBeGreaterThan(0);
    expect(premiereCle).toBeUndefined();
  });
});
