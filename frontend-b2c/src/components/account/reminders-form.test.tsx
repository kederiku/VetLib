/**
 * Tests de la carte « Rappels ».
 *
 * Le choix verrouillé ici est l'absence d'auto-enregistrement : les
 * cases ne partent qu'au clic sur « Enregistrer ». Un auto-save
 * laisserait, en cas d'échec réseau, une case visuellement cochée que le
 * serveur ignore -- et il faudrait alors la décocher toute seule, une
 * animation qui donne l'impression d'un bug.
 *
 * Les cases sont interrogees par ROLE et non par libelle : Base UI rend
 * le texte du FieldLabel dans deux noeuds, getByLabelText en trouverait
 * donc deux.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RemindersForm } from "@/components/account/reminders-form";
import { buildOwner } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ save: vi.fn(), toastSuccess: vi.fn() }));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => simulations.toastSuccess(...args),
    error: vi.fn(),
  },
  Toaster: () => null,
}));

function afficher(preferences: { email?: boolean; sms?: boolean }) {
  return renderWithProviders(
    <RemindersForm
      owner={buildOwner({ notification_preferences: preferences })}
      save={simulations.save}
      isSaving={false}
    />,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("RemindersForm", () => {
  it("reflète les préférences enregistrées", () => {
    afficher({ email: true, sms: false });

    expect(screen.getByRole("checkbox", { name: "Par email" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Par SMS" })).not.toBeChecked();
  });

  it("retombe sur les défauts du backend si un canal manque", () => {
    // Miroir du domaine : email opt-in par défaut, SMS non.
    afficher({});

    expect(screen.getByRole("checkbox", { name: "Par email" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Par SMS" })).not.toBeChecked();
  });

  it("n'enregistre RIEN au clic sur une case", async () => {
    afficher({ email: true, sms: false });

    await userEvent.setup().click(screen.getByRole("checkbox", { name: "Par SMS" }));

    expect(screen.getByRole("checkbox", { name: "Par SMS" })).toBeChecked();
    expect(simulations.save).not.toHaveBeenCalled();
  });

  it("envoie les deux canaux au clic sur Enregistrer", async () => {
    simulations.save.mockResolvedValue(buildOwner());
    afficher({ email: true, sms: false });
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole("checkbox", { name: "Par SMS" }));
    await utilisateur.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(simulations.save).toHaveBeenCalled());
    expect(simulations.save.mock.calls[0][0]).toEqual({
      notification_preferences: { email: true, sms: true },
    });
    expect(simulations.toastSuccess).toHaveBeenCalledWith(
      "Préférences enregistrées",
    );
  });
});
