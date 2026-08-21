/**
 * Tests de la carte « À confirmer » du tableau de bord.
 *
 * C'est la file d'attente du poste d'accueil : les demandes de rendez-vous
 * arrivées du portail propriétaires, à valider ou à refuser. Deux points la
 * rendent sûre. D'abord la limite d'aperçu : au-delà de cinq, la carte
 * deviendrait une seconde liste complète et écraserait le reste du tableau de
 * bord. Ensuite le verrouillage des boutons pendant une action — sans lui, un
 * double clic enverrait deux confirmations pour le même rendez-vous.
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PendingCard } from "@/components/dashboard/pending-card";
import { buildAgendaEntry } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({
  useGetAgenda: vi.fn(),
  confirm: vi.fn(),
  isBusy: false,
  isConfirming: false,
}));

vi.mock("@/lib/api/generated/scheduling/scheduling", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/api/generated/scheduling/scheduling")
  >()),
  useGetAgenda: simulations.useGetAgenda,
}));

vi.mock("@/lib/scheduling/use-appointment-transitions", () => ({
  useAppointmentTransitions: () => ({
    confirm: simulations.confirm,
    complete: vi.fn(),
    isBusy: simulations.isBusy,
    isConfirming: simulations.isConfirming,
  }),
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

/** Demande en attente à la date donnée. */
function demande(id: string, jour = "20") {
  return buildAgendaEntry({
    id,
    status: "pending",
    starts_at: `2026-08-${jour}T07:00:00Z`,
    ends_at: `2026-08-${jour}T07:30:00Z`,
    guest_name: `Client ${id}`,
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-08-20T09:00:00Z"));
  simulations.isBusy = false;
  simulations.isConfirming = false;
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("PendingCard — états", () => {
  it("affiche des squelettes pendant le chargement", () => {
    simulations.useGetAgenda.mockReturnValue(requete({ isPending: true }));
    renderWithProviders(<PendingCard />);

    expect(screen.getByText("À confirmer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmer" })).not.toBeInTheDocument();
  });

  it("permet de relancer après un échec", async () => {
    const refetch = vi.fn();
    simulations.useGetAgenda.mockReturnValue(requete({ isError: true, refetch }));
    renderWithProviders(<PendingCard />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Réessayer" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("rassure quand il n'y a rien à traiter", () => {
    // « Tout est à jour » vaut mieux qu'une carte vide : l'accueil sait
    // que la file a bien été chargée, et qu'elle est effectivement vide.
    simulations.useGetAgenda.mockReturnValue(requete({ data: [] }));
    renderWithProviders(<PendingCard />);

    expect(
      screen.getByText("Aucun rendez-vous en attente. Tout est à jour."),
    ).toBeInTheDocument();
  });
});

describe("PendingCard — file d'attente", () => {
  it("liste les demandes avec leur client", () => {
    simulations.useGetAgenda.mockReturnValue(
      requete({ data: [demande("a"), demande("b", "21")] }),
    );
    renderWithProviders(<PendingCard />);

    expect(screen.getByText(/Client a/)).toBeInTheDocument();
    expect(screen.getByText(/Client b/)).toBeInTheDocument();
  });

  it("s'arrête à cinq demandes", () => {
    // Au-delà, la carte deviendrait une seconde liste complète et
    // écraserait le reste du tableau de bord.
    simulations.useGetAgenda.mockReturnValue(
      requete({
        data: Array.from({ length: 8 }, (_, i) => demande(`d${i}`, "2" + (i % 8))),
      }),
    );
    renderWithProviders(<PendingCard />);

    expect(screen.getAllByRole("button", { name: /Confirmer/ })).toHaveLength(5);
  });

  it("ignore les rendez-vous déjà confirmés", () => {
    simulations.useGetAgenda.mockReturnValue(
      requete({
        data: [
          demande("attente"),
          buildAgendaEntry({
            id: "confirme",
            status: "confirmed",
            starts_at: "2026-08-20T08:00:00Z",
            guest_name: "Client confirme",
          }),
        ],
      }),
    );
    renderWithProviders(<PendingCard />);

    expect(screen.getByText(/Client attente/)).toBeInTheDocument();
    expect(screen.queryByText(/Client confirme/)).not.toBeInTheDocument();
  });
});

describe("PendingCard — actions", () => {
  it("confirme la demande choisie", async () => {
    simulations.useGetAgenda.mockReturnValue(requete({ data: [demande("a")] }));
    renderWithProviders(<PendingCard />);

    await userEvent.setup().click(screen.getByRole("button", { name: /Confirmer/ }));

    expect(simulations.confirm).toHaveBeenCalledExactlyOnceWith("a");
  });

  it("verrouille les boutons pendant une action en cours", () => {
    // Sans ce verrou, un double clic enverrait deux confirmations pour le
    // même rendez-vous.
    simulations.isBusy = true;
    simulations.useGetAgenda.mockReturnValue(requete({ data: [demande("a")] }));
    renderWithProviders(<PendingCard />);

    expect(screen.getByRole("button", { name: /Confirmer/ })).toBeDisabled();
  });
});
