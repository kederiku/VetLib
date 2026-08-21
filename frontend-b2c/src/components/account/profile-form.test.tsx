/**
 * Tests du formulaire de profil du propriétaire.
 *
 * C'est le plus gros formulaire du portail, et celui qui porte la règle la
 * plus subtile : l'adresse est « tout ou rien ». Laisser passer une adresse
 * partielle enverrait au serveur une donnée inexploitable pour un courrier,
 * sans qu'aucune erreur ne soit visible avant le jour où quelqu'un imprime
 * une étiquette.
 *
 * On simule la mutation plutôt que le réseau : les états de succès et d'échec
 * se posent alors directement, et le test reste centré sur ce que le
 * formulaire fait de la réponse.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProfileForm } from "@/components/account/profile-form";
import { ApiError } from "@/lib/api/errors";
import { getGetCurrentOwnerQueryKey } from "@/lib/api/generated/owner-auth/owner-auth";
import { buildAddress, buildOwner } from "@/test/fixtures";
import { createTestQueryClient, renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ mutateAsync: vi.fn() }));

vi.mock(
  "@/lib/api/generated/owner-profile/owner-profile",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/lib/api/generated/owner-profile/owner-profile")
    >()),
    useUpdateOwnerProfile: () => ({ mutateAsync: simulations.mutateAsync }),
  }),
);

/** Monte le formulaire avec un propriétaire donné déjà en cache. */
function afficher(surcharges: Parameters<typeof buildOwner>[0] = {}) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(getGetCurrentOwnerQueryKey(), {
    status: 200,
    data: buildOwner(surcharges),
    headers: new Headers(),
  });
  return renderWithProviders(<ProfileForm />, { queryClient });
}

const enregistrer = () =>
  userEvent.setup().click(screen.getByRole("button", { name: /Enregistrer/ }));

afterEach(() => {
  vi.clearAllMocks();
});

describe("ProfileForm — préremplissage", () => {
  it("reprend l'identité du propriétaire connecté", () => {
    afficher({ first_name: "Marie", last_name: "Dupont", phone: "0612345678" });

    expect(screen.getByLabelText(/Prénom/)).toHaveValue("Marie");
    expect(screen.getByLabelText(/^Nom/)).toHaveValue("Dupont");
    expect(screen.getByLabelText(/Téléphone/)).toHaveValue("0612345678");
  });

  it("laisse les champs d'adresse vides quand il n'y en a pas", () => {
    // address vaut null côté API : les champs doivent afficher du vide,
    // jamais la chaîne « null ».
    afficher({ address: null });

    expect(screen.getByLabelText(/Adresse \(ligne 1\)/)).toHaveValue("");
    expect(screen.getByLabelText(/Code postal/)).toHaveValue("");
  });

  it("reprend l'adresse existante", () => {
    afficher({ address: buildAddress({ city: "Montpellier" }) });

    expect(screen.getByLabelText(/Adresse \(ligne 1\)/)).toHaveValue(
      "12 rue des Lilas",
    );
    expect(screen.getByLabelText(/Ville/)).toHaveValue("Montpellier");
  });
});

describe("ProfileForm — validation locale", () => {
  it("refuse un prénom vide sans appeler le serveur", async () => {
    afficher();
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText(/Prénom/));
    await enregistrer();

    expect(await screen.findByText("Le prénom est requis.")).toBeInTheDocument();
    expect(simulations.mutateAsync).not.toHaveBeenCalled();
  });

  it("réclame l'adresse entière dès qu'un champ est rempli", async () => {
    // Le cas piégeux : saisir la seule ligne 2 doit réclamer les trois
    // autres champs, sinon l'adresse serait inutilisable.
    afficher({ address: null });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Complément/), "Bâtiment C");
    await enregistrer();

    expect(
      await screen.findByText(/L'adresse \(ligne 1\) est requise/),
    ).toBeInTheDocument();
    expect(simulations.mutateAsync).not.toHaveBeenCalled();
  });

  it("impose un code postal à cinq chiffres", async () => {
    afficher({ address: buildAddress() });
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText(/Code postal/));
    await user.type(screen.getByLabelText(/Code postal/), "340");
    await enregistrer();

    expect(
      await screen.findByText(/Le code postal doit contenir exactement 5 chiffres/),
    ).toBeInTheDocument();
  });

  it("accepte un profil sans aucune adresse", async () => {
    simulations.mutateAsync.mockResolvedValue({
      status: 200,
      data: buildOwner(),
      headers: new Headers(),
    });
    afficher({ address: null });
    await enregistrer();

    await waitFor(() => expect(simulations.mutateAsync).toHaveBeenCalled());
  });
});

describe("ProfileForm — enregistrement", () => {
  it("transmet les modifications saisies", async () => {
    simulations.mutateAsync.mockResolvedValue({
      status: 200,
      data: buildOwner(),
      headers: new Headers(),
    });
    afficher({ first_name: "Marie" });
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText(/Prénom/));
    await user.type(screen.getByLabelText(/Prénom/), "Marianne");
    await enregistrer();

    await waitFor(() => {
      const envoi = simulations.mutateAsync.mock.calls[0][0];
      expect(envoi.data.first_name).toBe("Marianne");
    });
  });

  it("confirme l'enregistrement", async () => {
    simulations.mutateAsync.mockResolvedValue({
      status: 200,
      data: buildOwner(),
      headers: new Headers(),
    });
    afficher();
    await enregistrer();

    expect(await screen.findByText("Profil enregistré")).toBeInTheDocument();
  });

  it("place une erreur de champ sous le bon champ", async () => {
    simulations.mutateAsync.mockRejectedValue(
      new ApiError({
        status: 422,
        detail: "Certains champs sont invalides.",
        validation: [
          { loc: ["body", "phone"], msg: "Numéro invalide", type: "value_error" },
        ],
      }),
    );
    afficher();
    await enregistrer();

    expect(await screen.findByText("Numéro invalide")).toBeInTheDocument();
  });

  it("annonce une panne réseau sans jargon", async () => {
    simulations.mutateAsync.mockRejectedValue(new TypeError("Failed to fetch"));
    afficher();
    await enregistrer();

    expect(
      await screen.findByText(/Impossible de contacter le serveur/),
    ).toBeInTheDocument();
  });
});

describe("ProfileForm — préférences de rappel", () => {
  it("reprend les préférences existantes", () => {
    afficher({ notification_preferences: { email: true, sms: false } });

    // getByRole et non getByLabelText : la case à cocher de la bibliothèque
    // d'interface rend à la fois un span accessible et un input caché, tous
    // deux porteurs du même libellé.
    expect(
      screen.getByRole("checkbox", { name: "Rappels par email" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Rappels par SMS" }),
    ).not.toBeChecked();
  });
});
