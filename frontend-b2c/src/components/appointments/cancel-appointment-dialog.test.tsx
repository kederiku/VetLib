/**
 * Tests du dialogue d'annulation.
 *
 * Le comportement le moins evident est l'INVALIDATION MEME EN ECHEC. Un
 * 409 signifie que notre copie locale etait perimee (statut ou horaire
 * ayant change cote clinique) : re-synchroniser tout de suite evite de
 * reproposer une annulation vouee au meme refus. Rien d'autre ne
 * verrouille cette regle.
 *
 * Second point : les retours passent par des TOASTS et non par un
 * bandeau inline, parce que le dialogue se ferme dans tous les cas --
 * un bandeau n'aurait nulle part ou s'afficher.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CancelAppointmentDialog } from "@/components/appointments/cancel-appointment-dialog";
import { getListMyAppointmentsQueryKey } from "@/lib/api/generated/owner-appointments/owner-appointments";
import { buildOwnerAppointment } from "@/test/fixtures";
import { createTestQueryClient, renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({
  reponse: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => simulations.toastSuccess(...args),
    error: (...args: unknown[]) => simulations.toastError(...args),
  },
  Toaster: () => null,
}));

// On simule la couche HTTP et non le hook : la vraie mutation TanStack
// est alors exercee, invalidations comprises.
vi.mock("@/lib/api/mutator", () => ({
  customFetch: (...args: unknown[]) => simulations.reponse(...args),
}));

afterEach(() => {
  vi.clearAllMocks();
});

async function annuler(onCancelled = vi.fn()) {
  const queryClient = createTestQueryClient();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  renderWithProviders(
    <CancelAppointmentDialog
      open
      onOpenChange={vi.fn()}
      appointment={buildOwnerAppointment()}
      onCancelled={onCancelled}
    />,
    { queryClient },
  );

  await userEvent
    .setup()
    .click(await screen.findByRole("button", { name: "Annuler le rendez-vous" }));

  return { invalidate, onCancelled };
}

describe("CancelAppointmentDialog — succès", () => {
  it("confirme par un toast et prévient l'appelant", async () => {
    simulations.reponse.mockResolvedValue({ status: 200, data: {} });

    const { onCancelled } = await annuler();

    await waitFor(() =>
      expect(simulations.toastSuccess).toHaveBeenCalledWith("Rendez-vous annulé"),
    );
    expect(onCancelled).toHaveBeenCalledTimes(1);
  });

  it("rafraîchit la liste ET les disponibilités de la clinique", async () => {
    // L'annulation LIBERE le creneau : le tunnel de reservation garde en
    // cache des disponibilites desormais fausses.
    simulations.reponse.mockResolvedValue({ status: 200, data: {} });

    const { invalidate } = await annuler();

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: getListMyAppointmentsQueryKey(),
      }),
    );
    expect(invalidate.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe("CancelAppointmentDialog — échec", () => {
  it("annonce le refus métier en toast, sans prétendre avoir annulé", async () => {
    simulations.reponse.mockRejectedValue(
      Object.assign(new Error("409"), {
        status: 409,
        code: "scheduling.cancellation_too_late",
        detail: "Trop tard.",
      }),
    );

    const { onCancelled } = await annuler();

    await waitFor(() => expect(simulations.toastError).toHaveBeenCalled());
    expect(simulations.toastSuccess).not.toHaveBeenCalled();
    expect(onCancelled).not.toHaveBeenCalled();
  });

  it("re-synchronise la liste MEME en échec", async () => {
    // Un 409 prouve que notre copie locale etait perimee : sans ce
    // rafraichissement, on reproposerait la meme annulation impossible.
    simulations.reponse.mockRejectedValue(new TypeError("Failed to fetch"));

    const { invalidate } = await annuler();

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: getListMyAppointmentsQueryKey(),
      }),
    );
  });
});
