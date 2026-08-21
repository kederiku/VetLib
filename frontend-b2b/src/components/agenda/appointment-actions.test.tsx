/**
 * Tests du menu d'actions d'un rendez-vous.
 *
 * Les actions proposées dépendent du statut, et c'est tout l'enjeu : proposer
 * « Confirmer » sur un rendez-vous déjà confirmé mènerait à un refus du
 * serveur, et proposer « Terminer » sur une demande non confirmée court-
 * circuiterait le circuit de validation. Sur un rendez-vous clos, le menu
 * disparaît entièrement — il n'y a plus rien à faire.
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppointmentActions } from "@/components/agenda/appointment-actions";
import { buildAgendaEntry } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({
  confirm: vi.fn(),
  complete: vi.fn(),
  isBusy: false,
}));

vi.mock("@/lib/scheduling/use-appointment-transitions", () => ({
  useAppointmentTransitions: () => ({
    confirm: simulations.confirm,
    complete: simulations.complete,
    isBusy: simulations.isBusy,
    isConfirming: false,
    isCompleting: false,
  }),
}));

const ouvrirMenu = () =>
  userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Actions sur le rendez-vous" }));

afterEach(() => {
  simulations.isBusy = false;
  vi.clearAllMocks();
});

describe("AppointmentActions — visibilité", () => {
  it("disparaît sur un rendez-vous terminé", () => {
    // Plus rien à faire : un menu vide serait une invitation trompeuse.
    renderWithProviders(
      <AppointmentActions entry={buildAgendaEntry({ status: "completed" })} />,
    );

    expect(
      screen.queryByRole("button", { name: "Actions sur le rendez-vous" }),
    ).not.toBeInTheDocument();
  });

  it("disparaît sur un rendez-vous annulé", () => {
    renderWithProviders(
      <AppointmentActions entry={buildAgendaEntry({ status: "cancelled" })} />,
    );

    expect(
      screen.queryByRole("button", { name: "Actions sur le rendez-vous" }),
    ).not.toBeInTheDocument();
  });
});

describe("AppointmentActions — demande en attente", () => {
  it("propose de confirmer, pas de terminer", async () => {
    // Terminer une demande non confirmée court-circuiterait la validation.
    renderWithProviders(
      <AppointmentActions entry={buildAgendaEntry({ status: "pending" })} />,
    );
    await ouvrirMenu();

    expect(await screen.findByText("Confirmer")).toBeInTheDocument();
    expect(screen.queryByText("Terminer")).not.toBeInTheDocument();
  });

  it("confirme le bon rendez-vous", async () => {
    renderWithProviders(
      <AppointmentActions
        entry={buildAgendaEntry({ id: "rdv-7", status: "pending" })}
      />,
    );
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Actions sur le rendez-vous" }),
    );
    await user.click(await screen.findByText("Confirmer"));

    expect(simulations.confirm).toHaveBeenCalledExactlyOnceWith("rdv-7");
  });
});

describe("AppointmentActions — rendez-vous confirmé", () => {
  it("propose de terminer, pas de confirmer", async () => {
    renderWithProviders(
      <AppointmentActions entry={buildAgendaEntry({ status: "confirmed" })} />,
    );
    await ouvrirMenu();

    expect(await screen.findByText("Terminer")).toBeInTheDocument();
    expect(screen.queryByText("Confirmer")).not.toBeInTheDocument();
  });

  it("termine le bon rendez-vous", async () => {
    renderWithProviders(
      <AppointmentActions
        entry={buildAgendaEntry({ id: "rdv-9", status: "confirmed" })}
      />,
    );
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Actions sur le rendez-vous" }),
    );
    await user.click(await screen.findByText("Terminer"));

    expect(simulations.complete).toHaveBeenCalledExactlyOnceWith("rdv-9");
  });
});

describe("AppointmentActions — annulation et verrouillage", () => {
  it("propose l'annulation dans les deux statuts actifs", async () => {
    for (const status of ["pending", "confirmed"] as const) {
      const { unmount } = renderWithProviders(
        <AppointmentActions entry={buildAgendaEntry({ status })} />,
      );
      await ouvrirMenu();
      expect(await screen.findByText("Annuler"), status).toBeInTheDocument();
      unmount();
    }
  });

  it("verrouille le menu pendant une action en cours", () => {
    // Sans ce verrou, un double clic enverrait deux fois la même action.
    simulations.isBusy = true;
    renderWithProviders(
      <AppointmentActions entry={buildAgendaEntry({ status: "pending" })} />,
    );

    expect(
      screen.getByRole("button", { name: "Actions sur le rendez-vous" }),
    ).toBeDisabled();
  });
});
