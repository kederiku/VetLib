/**
 * Tests du dialogue « ajouter un membre » d'une clinique.
 *
 * Même enjeu que la création d'une clinique : le mot de passe généré n'est
 * lisible qu'une fois. Le dialogue doit donc basculer sur la remise et
 * refuser de se fermer tant qu'elle est à l'écran. On vérifie aussi le rôle
 * par défaut — Gérant — parce que c'est le besoin qui amène sur cet écran :
 * un ASV recruté se crée depuis le portail de la clinique, par son gérant.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StaffCreateDialog } from "@/components/staff/staff-create-dialog";
import { renderWithProviders } from "@/test/render";

const simulations = vi.hoisted(() => ({ reponse: vi.fn() }));

vi.mock("@/lib/api/mutator", () => ({
  customFetch: (...args: unknown[]) => simulations.reponse(...args),
}));

const CLINIQUE_ID = "00000000-0000-0000-0000-0000000000c1";
const CREE = {
  user_id: "00000000-0000-0000-0000-0000000000e1",
  email: "claire.martin@lilas.fr",
  role: "manager",
  temporary_password: "orage-tulipe-galet-fresque-avoine",
};

function afficher(onOpenChange = vi.fn()) {
  renderWithProviders(
    <StaffCreateDialog
      clinicId={CLINIQUE_ID}
      clinicName="Clinique des Lilas"
      open
      onOpenChange={onOpenChange}
    />,
  );
  return { onOpenChange, utilisateur: userEvent.setup() };
}

async function remplirEtSoumettre(
  utilisateur: ReturnType<typeof userEvent.setup>,
) {
  await utilisateur.type(screen.getByLabelText("Email"), CREE.email);
  await utilisateur.type(screen.getByLabelText("Prénom"), "Claire");
  await utilisateur.type(screen.getByLabelText("Nom"), "Martin");
  await utilisateur.click(
    screen.getByRole("button", { name: "Créer le compte" }),
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("StaffCreateDialog", () => {
  it("propose Gérant par défaut", () => {
    afficher();
    expect(screen.getByRole("combobox")).toHaveTextContent("Gérant");
  });

  it("crée le compte sur la bonne clinique et remet le mot de passe", async () => {
    simulations.reponse.mockResolvedValue({
      status: 201,
      data: CREE,
      headers: new Headers(),
    });
    const { utilisateur, onOpenChange } = afficher();

    await remplirEtSoumettre(utilisateur);

    await waitFor(() => {
      expect(simulations.reponse).toHaveBeenCalledOnce();
    });
    const [url, options] = simulations.reponse.mock.calls[0] as [
      string,
      { method: string; body: string },
    ];
    expect(url).toContain(`/api/v1/admin/clinics/${CLINIQUE_ID}/staff`);
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body)).toEqual({
      email: CREE.email,
      first_name: "Claire",
      last_name: "Martin",
      role: "manager",
    });

    expect(await screen.findByLabelText("Mot de passe temporaire")).toHaveValue(
      CREE.temporary_password,
    );
    // Le dialogue reste ouvert : fermer ici perdrait le secret.
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("ne ferme qu'après confirmation de la prise en note", async () => {
    simulations.reponse.mockResolvedValue({
      status: 201,
      data: CREE,
      headers: new Headers(),
    });
    const { utilisateur, onOpenChange } = afficher();

    await remplirEtSoumettre(utilisateur);
    await utilisateur.click(
      await screen.findByRole("button", { name: /j'ai noté le mot de passe/i }),
    );

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("ne propose aucun champ de mot de passe", () => {
    // Le secret est généré par le backend. Laisser un exploitant le choisir
    // lui donnerait un accès en clair au compte qu'il vient de créer.
    afficher();
    expect(screen.queryByLabelText(/mot de passe/i)).not.toBeInTheDocument();
  });
});
