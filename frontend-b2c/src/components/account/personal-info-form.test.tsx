/**
 * Tests de la carte « Informations personnelles ».
 *
 * Ce qu'elle doit garantir : n'envoyer QUE ses champs (la recomposition
 * de la fiche complète revient au hook), traduire un téléphone vide en
 * null -- une chaîne vide échouerait la validation backend -- et
 * afficher les erreurs 422 SOUS le champ concerné.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PersonalInfoForm } from "@/components/account/personal-info-form";
import { buildOwner } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({
  save: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => simulations.toastSuccess(...args),
    error: vi.fn(),
  },
  Toaster: () => null,
}));

function afficher(
  surcharges: Parameters<typeof buildOwner>[0] = {},
  isSaving = false,
) {
  return renderWithProviders(
    <PersonalInfoForm
      owner={buildOwner(surcharges)}
      save={simulations.save}
      isSaving={isSaving}
    />,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("PersonalInfoForm", () => {
  it("pré-remplit les champs depuis la fiche", () => {
    afficher({ first_name: "Marie", last_name: "Dupont", phone: "0612345678" });

    expect(screen.getByLabelText("Prénom")).toHaveValue("Marie");
    expect(screen.getByLabelText("Nom")).toHaveValue("Dupont");
    expect(screen.getByLabelText(/Téléphone/)).toHaveValue("0612345678");
  });

  it("n'envoie QUE ses trois champs", async () => {
    simulations.save.mockResolvedValue(buildOwner());
    afficher();

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(simulations.save).toHaveBeenCalled());
    expect(Object.keys(simulations.save.mock.calls[0][0]).sort()).toEqual([
      "first_name",
      "last_name",
      "phone",
    ]);
  });

  it("traduit un téléphone vide en null", async () => {
    // Le backend l'accepte nullable, mais refuserait une chaîne vide.
    simulations.save.mockResolvedValue(buildOwner());
    afficher({ phone: null });

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(simulations.save).toHaveBeenCalled());
    expect(simulations.save.mock.calls[0][0].phone).toBeNull();
  });

  it("refuse un prénom vide, sans rien envoyer", async () => {
    afficher({ first_name: "Marie" });
    const utilisateur = userEvent.setup();

    await utilisateur.clear(screen.getByLabelText("Prénom"));
    await utilisateur.click(
      screen.getByRole("button", { name: "Enregistrer" }),
    );

    expect(
      await screen.findByText("Le prénom est requis."),
    ).toBeInTheDocument();
    expect(simulations.save).not.toHaveBeenCalled();
  });

  it("désactive son bouton pendant l'enregistrement d'une AUTRE carte", () => {
    // isSaving est partagé : c'est ce qui sérialise les envois et évite
    // que le second PUT n'écrase le premier.
    afficher({}, true);

    expect(screen.getByRole("button", { name: /Enregistrer/ })).toBeDisabled();
  });
});
