/**
 * Tests de la semaine type d'un praticien.
 *
 * C'est le formulaire dont dépend TOUTE la prise de rendez-vous en ligne : ce
 * qui est saisi ici détermine les créneaux proposés aux propriétaires. Une
 * erreur ne se voit pas dans l'interface — elle ouvre à la réservation des
 * heures pendant lesquelles la clinique est fermée, ou l'inverse.
 *
 * Deux règles y sont invisibles à la relecture et vérifiées ici : les jours
 * FERMÉS gardent leurs horaires en mémoire sans être validés ni envoyés, et
 * deux plages du même jour ne peuvent pas se chevaucher.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WeeklyScheduleForm } from "@/components/settings/weekly-schedule-form";
import { buildWeeklySchedule } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({
  useGetResourceWeeklySchedule: vi.fn(),
  mutateAsync: vi.fn(),
  toastSucces: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: simulations.toastSucces, error: vi.fn() },
  Toaster: () => null,
}));

vi.mock("@/lib/api/generated/scheduling/scheduling", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/api/generated/scheduling/scheduling")
  >()),
  useGetResourceWeeklySchedule: simulations.useGetResourceWeeklySchedule,
  useSetResourceWeeklySchedule: () => ({ mutateAsync: simulations.mutateAsync }),
}));

const PRATICIEN = "00000000-0000-0000-0000-0000000000a1";

/** Monte le formulaire avec la semaine type donnée. */
function afficher(items = [buildWeeklySchedule()]) {
  simulations.useGetResourceWeeklySchedule.mockReturnValue({
    data: items,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
  return renderWithProviders(<WeeklyScheduleForm resourceId={PRATICIEN} />);
}

const enregistrer = () =>
  userEvent.setup().click(screen.getByRole("button", { name: /Enregistrer/ }));

afterEach(() => {
  vi.clearAllMocks();
});

describe("WeeklyScheduleForm — états", () => {
  it("affiche des squelettes pendant le chargement", () => {
    simulations.useGetResourceWeeklySchedule.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      refetch: vi.fn(),
    });
    renderWithProviders(<WeeklyScheduleForm resourceId={PRATICIEN} />);

    expect(screen.queryByRole("button", { name: /Enregistrer/ })).not.toBeInTheDocument();
  });

  it("annonce l'échec du chargement", () => {
    simulations.useGetResourceWeeklySchedule.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch: vi.fn(),
    });
    renderWithProviders(<WeeklyScheduleForm resourceId={PRATICIEN} />);

    expect(
      screen.getByText("Impossible de charger la semaine type."),
    ).toBeInTheDocument();
  });
});

describe("WeeklyScheduleForm — préremplissage", () => {
  it("présente les sept jours de la semaine", () => {
    afficher();

    for (const jour of [
      "Lundi",
      "Mardi",
      "Mercredi",
      "Jeudi",
      "Vendredi",
      "Samedi",
      "Dimanche",
    ]) {
      expect(screen.getByText(jour), jour).toBeInTheDocument();
    }
  });

  it("reprend les horaires enregistrés", () => {
    afficher([
      buildWeeklySchedule({ weekday: 0, start_time: "08:30", end_time: "19:00" }),
    ]);

    expect(screen.getByLabelText(/Ouverture Lundi/)).toHaveValue("08:30");
    expect(screen.getByLabelText(/Fermeture Lundi/)).toHaveValue("19:00");
  });

  it("ouvre uniquement les jours qui ont des horaires", () => {
    // Un jour sans plage enregistrée est un jour fermé : le laisser ouvert
    // proposerait des créneaux là où la clinique ne reçoit pas.
    afficher([buildWeeklySchedule({ weekday: 0 })]);

    expect(screen.getByLabelText(/Ouverture Lundi/)).toBeInTheDocument();
  });

  it("reprend plusieurs plages pour un même jour", () => {
    // Matin et après-midi séparés par la pause déjeuner : le cas nominal
    // d'une clinique.
    afficher([
      buildWeeklySchedule({ weekday: 0, start_time: "09:00", end_time: "12:00" }),
      buildWeeklySchedule({ weekday: 0, start_time: "14:00", end_time: "18:00" }),
    ]);

    expect(screen.getByLabelText(/Ouverture Lundi \(plage 1\)/)).toHaveValue("09:00");
    expect(screen.getByLabelText(/Ouverture Lundi \(plage 2\)/)).toHaveValue("14:00");
  });
});

describe("WeeklyScheduleForm — validation", () => {
  it("refuse une fermeture antérieure à l'ouverture", async () => {
    afficher();
    const user = userEvent.setup();
    const fermeture = screen.getByLabelText(/Fermeture Lundi/);
    await user.clear(fermeture);
    await user.type(fermeture, "08:00");
    await enregistrer();

    expect(
      await screen.findByText("L'heure de fermeture doit être après l'ouverture."),
    ).toBeInTheDocument();
    expect(simulations.mutateAsync).not.toHaveBeenCalled();
  });

  it("refuse deux plages qui se chevauchent", async () => {
    afficher([
      buildWeeklySchedule({ weekday: 0, start_time: "09:00", end_time: "13:00" }),
      buildWeeklySchedule({ weekday: 0, start_time: "12:00", end_time: "18:00" }),
    ]);
    await enregistrer();

    expect(
      await screen.findByText(
        "Deux plages du même jour ne peuvent pas se chevaucher.",
      ),
    ).toBeInTheDocument();
    expect(simulations.mutateAsync).not.toHaveBeenCalled();
  });

  it("accepte deux plages disjointes", async () => {
    simulations.mutateAsync.mockResolvedValue({ status: 200, data: [] });
    afficher([
      buildWeeklySchedule({ weekday: 0, start_time: "09:00", end_time: "12:00" }),
      buildWeeklySchedule({ weekday: 0, start_time: "14:00", end_time: "18:00" }),
    ]);
    await enregistrer();

    await waitFor(() => expect(simulations.mutateAsync).toHaveBeenCalled());
  });
});

describe("WeeklyScheduleForm — enregistrement", () => {
  it("transmet la semaine au bon praticien", async () => {
    simulations.mutateAsync.mockResolvedValue({ status: 200, data: [] });
    afficher();
    await enregistrer();

    await waitFor(() => {
      const envoi = simulations.mutateAsync.mock.calls[0][0];
      expect(envoi.resourceId).toBe(PRATICIEN);
      // Une plage au moins part au serveur, portant l'horaire saisi. Noter
      // les SECONDES ajoutées à l'envoi : le champ de saisie donne "09:00",
      // le backend attend un temps complet "09:00:00".
      expect(envoi.data.items.length).toBeGreaterThan(0);
      expect(envoi.data.items[0]).toMatchObject({
        weekday: 0,
        start_time: "09:00:00",
        end_time: "18:00:00",
      });
    });
  });

  it("n'envoie PAS les jours fermés", async () => {
    // Ils gardent leurs horaires en mémoire côté interface — rouvrir le
    // mardi retrouve ses heures — mais ne doivent pas partir au serveur.
    simulations.mutateAsync.mockResolvedValue({ status: 200, data: [] });
    afficher([buildWeeklySchedule({ weekday: 0 })]);
    await enregistrer();

    await waitFor(() => {
      const items = simulations.mutateAsync.mock.calls[0][0].data.items;
      expect(items.every((item: { weekday: number }) => item.weekday === 0)).toBe(
        true,
      );
    });
  });

  it("confirme l'enregistrement", async () => {
    simulations.mutateAsync.mockResolvedValue({ status: 200, data: [] });
    afficher();
    await enregistrer();

    await waitFor(() =>
      expect(simulations.toastSucces).toHaveBeenCalledWith("Horaires enregistrés"),
    );
  });
});
