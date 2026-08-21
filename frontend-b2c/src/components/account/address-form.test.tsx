/**
 * Tests de la carte « Adresse ».
 *
 * Deux règles s'y croisent, et toutes deux ont une conséquence directe
 * sur ce que reçoit le backend :
 *
 * 1. TOUT-OU-RIEN : le backend attend `address: null` s'il n'y a pas
 *    d'adresse, JAMAIS un objet aux champs vides (422). Une adresse
 *    entamée doit donc être complétée.
 * 2. EFFACEMENT EN DEUX TEMPS : « Effacer » vide les champs, et c'est
 *    « Enregistrer » qui applique. Aucune seconde route d'écriture n'est
 *    nécessaire : une adresse vide vaut null, la règle 1 s'en charge.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AddressForm } from "@/components/account/address-form";
import { buildAddress, buildOwner } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ save: vi.fn(), toastSuccess: vi.fn() }));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => simulations.toastSuccess(...args),
    error: vi.fn(),
  },
  Toaster: () => null,
}));

function afficher(surcharges: Parameters<typeof buildOwner>[0] = {}) {
  return renderWithProviders(
    <AddressForm
      owner={buildOwner(surcharges)}
      save={simulations.save}
      isSaving={false}
    />,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("AddressForm", () => {
  it("pré-remplit les champs depuis la fiche", () => {
    afficher({ address: buildAddress({ city: "Montpellier" }) });

    expect(screen.getByLabelText("Ville")).toHaveValue("Montpellier");
  });

  it("n'envoie QUE l'adresse : le reste est recomposé par le hook", async () => {
    simulations.save.mockResolvedValue(buildOwner());
    afficher({ address: buildAddress() });

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(simulations.save).toHaveBeenCalledTimes(1));
    expect(Object.keys(simulations.save.mock.calls[0][0])).toEqual(["address"]);
  });

  it("traduit une adresse entièrement vide en null", async () => {
    // Le backend refuserait un objet aux champs vides par un 422.
    simulations.save.mockResolvedValue(buildOwner());
    afficher({ address: null });

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(simulations.save).toHaveBeenCalled());
    expect(simulations.save.mock.calls[0][0]).toEqual({ address: null });
  });

  it("réclame les champs essentiels dès qu'un seul est rempli", async () => {
    // Le cas piégeux : remplir la seule ligne 2 (un étage) doit réclamer
    // les trois autres, sans quoi le backend recevrait une adresse
    // inexploitable pour un courrier.
    afficher({ address: null });
    const utilisateur = userEvent.setup();

    await utilisateur.type(screen.getByLabelText(/Complément/), "Bâtiment C");
    await utilisateur.click(
      screen.getByRole("button", { name: "Enregistrer" }),
    );

    expect(await screen.findByText(/adresse \(ligne 1\)/i)).toBeInTheDocument();
    expect(simulations.save).not.toHaveBeenCalled();
  });

  it("ne propose « Effacer » que s'il y a une adresse à effacer", () => {
    afficher({ address: null });

    expect(
      screen.queryByRole("button", { name: /Effacer/ }),
    ).not.toBeInTheDocument();
  });

  it("efface en DEUX temps : vider les champs, puis enregistrer", async () => {
    simulations.save.mockResolvedValue(buildOwner({ address: null }));
    afficher({ address: buildAddress({ city: "Montpellier" }) });
    const utilisateur = userEvent.setup();

    await utilisateur.click(
      screen.getByRole("button", { name: /Effacer l'adresse/ }),
    );

    // Les champs sont vides, mais RIEN n'est encore parti.
    expect(screen.getByLabelText("Ville")).toHaveValue("");
    expect(simulations.save).not.toHaveBeenCalled();

    await utilisateur.click(
      screen.getByRole("button", { name: "Enregistrer" }),
    );

    await waitFor(() => expect(simulations.save).toHaveBeenCalled());
    expect(simulations.save.mock.calls[0][0]).toEqual({ address: null });
    expect(simulations.toastSuccess).toHaveBeenCalledWith("Adresse effacée");
  });
});
