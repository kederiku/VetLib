/**
 * Tests du dialogue d'édition d'un propriétaire.
 *
 * Le test qui compte vraiment est le dernier : le backend donne une VALEUR
 * PAR DÉFAUT à `notification_preferences`, si bien qu'omettre le champ ne
 * veut pas dire « ne change pas » mais « remets les valeurs par défaut ».
 * Corriger un numéro de téléphone réinitialiserait donc en silence les
 * choix de notification du client. Le formulaire renvoie ce que la fiche a
 * rendu ; ce test est le seul endroit qui empêche cette régression, parce
 * qu'elle est invisible à l'écran.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OwnerEditDialog } from "@/components/owners/owner-edit-dialog";
import { buildOwnerSummary } from "@/test/fixtures";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ reponse: vi.fn() }));

vi.mock("@/lib/api/mutator", () => ({
  customFetch: (...args: unknown[]) => simulations.reponse(...args),
}));

const PROPRIETAIRE = buildOwnerSummary();

/** Fiche complète, avec des préférences NON standard pour que l'oubli se voie. */
const FICHE = {
  ...PROPRIETAIRE,
  address: null,
  notification_preferences: { email: false, sms: true },
};

function routerLesAppels() {
  simulations.reponse.mockImplementation(
    (_url: string, options?: { method?: string }) =>
      Promise.resolve({
        status: 200,
        data: FICHE,
        headers: new Headers(),
        method: options?.method,
      }),
  );
}

function afficher(onOpenChange = vi.fn()) {
  renderWithProviders(
    <OwnerEditDialog
      ownerId={PROPRIETAIRE.id}
      open
      onOpenChange={onOpenChange}
    />,
  );
  return { onOpenChange, utilisateur: userEvent.setup() };
}

/** Corps JSON du PUT, une fois qu'il est parti. */
async function corpsDuPut(): Promise<Record<string, unknown>> {
  const appel = await waitFor(() => {
    const trouve = simulations.reponse.mock.calls.find(
      (candidat) => (candidat[1] as { method?: string })?.method === "PUT",
    );
    expect(trouve).toBeDefined();
    return trouve as [string, { body: string }];
  });
  return JSON.parse(appel[1].body) as Record<string, unknown>;
}

beforeEach(() => {
  routerLesAppels();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("OwnerEditDialog", () => {
  it("remplit le formulaire depuis la fiche chargée", async () => {
    afficher();
    expect(await screen.findByLabelText("Prénom")).toHaveValue("Claire");
    expect(screen.getByLabelText("Nom")).toHaveValue("Martin");
  });

  it("affiche l'email en lecture seule, avec l'explication", async () => {
    afficher();
    const email = await screen.findByLabelText("Email");
    expect(email).toBeDisabled();
    expect(email).toHaveValue(PROPRIETAIRE.email);
    expect(
      screen.getByText(/identifiant de connexion du client/i),
    ).toBeInTheDocument();
  });

  it("ne propose aucun champ de mot de passe", async () => {
    afficher();
    await screen.findByLabelText("Prénom");
    expect(screen.queryByLabelText(/mot de passe/i)).not.toBeInTheDocument();
  });

  it("RENVOIE les préférences de notification au lieu de les réinitialiser", async () => {
    const { utilisateur } = afficher();
    await screen.findByLabelText("Prénom");

    await utilisateur.clear(screen.getByLabelText("Téléphone"));
    await utilisateur.type(screen.getByLabelText("Téléphone"), "0700000000");
    await utilisateur.click(
      screen.getByRole("button", { name: "Enregistrer" }),
    );

    const corps = await corpsDuPut();
    // Les valeurs du client, pas les valeurs par défaut du backend.
    expect(corps.notification_preferences).toEqual({ email: false, sms: true });
    expect(corps.phone).toBe("0700000000");
    // Et surtout : pas d'email dans le corps, le schéma n'en a pas.
    expect(corps).not.toHaveProperty("email");
  });
});
