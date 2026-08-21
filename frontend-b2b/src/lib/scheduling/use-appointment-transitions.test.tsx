/**
 * Tests des transitions de statut d'un rendez-vous.
 *
 * Confirmer ou terminer un rendez-vous n'est pas qu'un appel réseau : chaque
 * action doit RAFRAÎCHIR l'agenda et les disponibilités, faute de quoi le
 * personnel verrait encore « à confirmer » sur un rendez-vous qu'il vient de
 * valider — et pourrait le confirmer deux fois. Le retour visuel (notification
 * de succès, message d'erreur lisible) fait partie du contrat : sans lui,
 * cliquer semble ne rien faire.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import { useAppointmentTransitions } from "@/lib/scheduling/use-appointment-transitions";
import { renderHookWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({
  confirmer: vi.fn(),
  terminer: vi.fn(),
  toastSucces: vi.fn(),
  toastErreur: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: simulations.toastSucces, error: simulations.toastErreur },
  Toaster: () => null,
}));

vi.mock("@/lib/api/generated/scheduling/scheduling", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/api/generated/scheduling/scheduling")
  >()),
  useConfirmAppointment: () => ({
    mutateAsync: simulations.confirmer,
    isPending: false,
  }),
  useCompleteAppointment: () => ({
    mutateAsync: simulations.terminer,
    isPending: false,
  }),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("useAppointmentTransitions — confirmation", () => {
  it("confirme le rendez-vous demandé", async () => {
    simulations.confirmer.mockResolvedValue({ status: 200 });
    const { result } = renderHookWithProviders(() => useAppointmentTransitions());

    await result.current.confirm("rdv-1");

    expect(simulations.confirmer).toHaveBeenCalledWith({ appointmentId: "rdv-1" });
  });

  it("rafraîchit l'agenda après une confirmation", async () => {
    // Sans invalidation, le rendez-vous resterait affiché « à confirmer »
    // et pourrait être confirmé une seconde fois.
    simulations.confirmer.mockResolvedValue({ status: 200 });
    const { result, queryClient } = renderHookWithProviders(() =>
      useAppointmentTransitions(),
    );
    const invalider = vi.spyOn(queryClient, "invalidateQueries");

    await result.current.confirm("rdv-1");

    expect(invalider).toHaveBeenCalled();
  });

  it("confirme visuellement le succès", async () => {
    simulations.confirmer.mockResolvedValue({ status: 200 });
    const { result } = renderHookWithProviders(() => useAppointmentTransitions());

    await result.current.confirm("rdv-1");

    expect(simulations.toastSucces).toHaveBeenCalledWith("Rendez-vous confirmé");
  });
});

describe("useAppointmentTransitions — clôture", () => {
  it("termine le rendez-vous demandé et le signale", async () => {
    simulations.terminer.mockResolvedValue({ status: 200 });
    const { result } = renderHookWithProviders(() => useAppointmentTransitions());

    await result.current.complete("rdv-2");

    expect(simulations.terminer).toHaveBeenCalledWith({ appointmentId: "rdv-2" });
    expect(simulations.toastSucces).toHaveBeenCalledWith("Rendez-vous terminé");
  });
});

describe("useAppointmentTransitions — erreurs", () => {
  it("traduit un refus métier en message lisible", async () => {
    // Le backend refuse une transition impossible (confirmer un rendez-vous
    // déjà annulé, par exemple) : le personnel doit comprendre pourquoi.
    simulations.confirmer.mockRejectedValue(
      new ApiError({
        status: 409,
        code: "scheduling.invalid_transition",
        detail: "Invalid transition",
      }),
    );
    const { result } = renderHookWithProviders(() => useAppointmentTransitions());

    await result.current.confirm("rdv-1");

    expect(simulations.toastErreur).toHaveBeenCalled();
    // Le detail anglais du backend ne doit pas remonter tel quel.
    expect(simulations.toastErreur.mock.calls[0][0]).not.toBe("Invalid transition");
  });

  it("ne laisse pas l'échec passer inaperçu", async () => {
    // Une erreur avalée en silence ferait croire que le clic a fonctionné.
    simulations.confirmer.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHookWithProviders(() => useAppointmentTransitions());

    await result.current.confirm("rdv-1");

    expect(simulations.toastErreur).toHaveBeenCalled();
    expect(simulations.toastSucces).not.toHaveBeenCalled();
  });

  it("ne rafraîchit pas l'agenda après un échec", async () => {
    // Rien n'a changé côté serveur : recharger serait du bruit réseau.
    simulations.confirmer.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result, queryClient } = renderHookWithProviders(() =>
      useAppointmentTransitions(),
    );
    const invalider = vi.spyOn(queryClient, "invalidateQueries");

    await result.current.confirm("rdv-1");

    expect(invalider).not.toHaveBeenCalled();
  });
});
