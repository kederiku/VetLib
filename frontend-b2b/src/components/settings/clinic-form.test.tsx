/**
 * Tests de la fiche clinique.
 *
 * C'est le formulaire le plus structurant des réglages : il porte le nom
 * affiché aux propriétaires, l'adresse, et surtout le FUSEAU HORAIRE de la
 * clinique — la référence de tout calcul de créneau. Il applique la même règle
 * d'adresse « tout ou rien » que le profil propriétaire : une adresse
 * partielle serait inexploitable pour un courrier.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ClinicForm } from "@/components/settings/clinic-form";
import { ApiError } from "@/lib/api/errors";
import { buildAddress, buildClinicProfile } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({
  useGetMyClinic: vi.fn(),
  mutateAsync: vi.fn(),
  toastSucces: vi.fn(),
}));

// La confirmation passe par une notification éphémère, et non par un message
// inline comme dans le portail propriétaires. On simule la bibliothèque
// plutôt que de monter son conteneur : le toast vit dans un portail avec ses
// propres animations, qu'il serait fragile d'attendre en test.
vi.mock("sonner", () => ({
  toast: { success: simulations.toastSucces, error: vi.fn() },
  Toaster: () => null,
}));

vi.mock("@/lib/api/generated/clinics/clinics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/generated/clinics/clinics")>()),
  useGetMyClinic: simulations.useGetMyClinic,
  useUpdateMyClinic: () => ({ mutateAsync: simulations.mutateAsync }),
}));

/** Monte le formulaire avec une fiche clinique donnée. */
function afficher(surcharges: Parameters<typeof buildClinicProfile>[0] = {}) {
  simulations.useGetMyClinic.mockReturnValue({
    data: buildClinicProfile(surcharges),
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
  return renderWithProviders(<ClinicForm />);
}

/**
 * Réponse du PUT : la fiche à jour. Le composant la relit pour réinitialiser
 * le formulaire, donc `data` est obligatoire — un mock qui l'omettrait
 * enverrait la soumission dans la branche d'erreur.
 */
function reponsePut(surcharges: Parameters<typeof buildClinicProfile>[0] = {}) {
  return {
    status: 200,
    data: buildClinicProfile(surcharges),
    headers: new Headers(),
  };
}

const enregistrer = () =>
  userEvent.setup().click(screen.getByRole("button", { name: /Enregistrer/ }));

afterEach(() => {
  vi.clearAllMocks();
});

describe("ClinicForm — préremplissage", () => {
  it("reprend la fiche existante", () => {
    afficher({ name: "Clinique des Peupliers", phone: "0467000000" });

    expect(screen.getByLabelText(/Nom de la clinique/)).toHaveValue(
      "Clinique des Peupliers",
    );
    expect(screen.getByLabelText(/Téléphone/)).toHaveValue("0467000000");
  });

  it("laisse l'adresse vide quand il n'y en a pas", () => {
    // address vaut null côté API : les champs doivent afficher du vide,
    // jamais la chaîne « null ».
    afficher({ address: null });

    expect(screen.getByLabelText(/Adresse \(ligne 1\)/)).toHaveValue("");
    expect(screen.getByLabelText(/Code postal/)).toHaveValue("");
  });

  it("reprend l'adresse existante", () => {
    afficher({ address: buildAddress({ city: "Montpellier" }) });

    expect(screen.getByLabelText(/Ville/)).toHaveValue("Montpellier");
  });
});

describe("ClinicForm — validation locale", () => {
  it("refuse un nom trop court sans appeler le serveur", async () => {
    afficher();
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText(/Nom de la clinique/));
    await user.type(screen.getByLabelText(/Nom de la clinique/), "A");
    await enregistrer();

    expect(await screen.findByText(/au moins 2 caractères/i)).toBeInTheDocument();
    expect(simulations.mutateAsync).not.toHaveBeenCalled();
  });

  it("réclame l'adresse entière dès qu'un champ est rempli", async () => {
    // Même règle que le profil propriétaire : une adresse partielle serait
    // inexploitable pour un courrier.
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
      await screen.findByText(/exactement 5 chiffres/),
    ).toBeInTheDocument();
  });

  it("accepte une fiche sans adresse", async () => {
    simulations.mutateAsync.mockResolvedValue(reponsePut());
    afficher({ address: null });
    await enregistrer();

    await waitFor(() => expect(simulations.mutateAsync).toHaveBeenCalled());
  });
});

describe("ClinicForm — enregistrement", () => {
  it("transmet les modifications", async () => {
    simulations.mutateAsync.mockResolvedValue(reponsePut());
    afficher({ name: "Clinique des Peupliers" });
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText(/Nom de la clinique/));
    await user.type(screen.getByLabelText(/Nom de la clinique/), "Clinique du Parc");
    await enregistrer();

    await waitFor(() => {
      expect(simulations.mutateAsync.mock.calls[0][0].data.name).toBe(
        "Clinique du Parc",
      );
    });
  });

  it("confirme l'enregistrement", async () => {
    simulations.mutateAsync.mockResolvedValue(reponsePut());
    afficher();
    await enregistrer();

    await waitFor(() =>
      expect(simulations.toastSucces).toHaveBeenCalledWith("Réglages enregistrés"),
    );
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
