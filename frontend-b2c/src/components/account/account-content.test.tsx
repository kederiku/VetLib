/**
 * Tests de la composition de la page « Mon compte ».
 *
 * Le point structurel à verrouiller est le PARTAGE de l'état
 * d'enregistrement : le hook est appelé une seule fois par la page et
 * distribué aux trois cartes, ce qui sérialise les envois. Deux PUT
 * concurrents partiraient d'une même base pré-mutation, et le second
 * écraserait le premier -- une perte de données qu'aucun message
 * d'erreur ne signalerait.
 *
 * Les cartes ont leurs propres tests : on les simule ici.
 */
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AccountContent } from "@/components/account/account-content";
import { getGetCurrentOwnerQueryKey } from "@/lib/api/generated/owner-auth/owner-auth";
import { buildOwner } from "@/test/fixtures";
import { createTestQueryClient, renderWithProviders } from "@/test/render";

const recus = vi.hoisted(() => ({ isSaving: [] as boolean[] }));

vi.mock("@/components/account/personal-info-form", () => ({
  PersonalInfoForm: ({ isSaving }: { isSaving: boolean }) => {
    recus.isSaving.push(isSaving);
    return <div>Informations personnelles simulées</div>;
  },
}));
vi.mock("@/components/account/address-form", () => ({
  AddressForm: ({ isSaving }: { isSaving: boolean }) => {
    recus.isSaving.push(isSaving);
    return <div>Adresse simulée</div>;
  },
}));
vi.mock("@/components/account/reminders-form", () => ({
  RemindersForm: ({ isSaving }: { isSaving: boolean }) => {
    recus.isSaving.push(isSaving);
    return <div>Rappels simulés</div>;
  },
}));

function afficher(surcharges: Parameters<typeof buildOwner>[0] = {}) {
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(getGetCurrentOwnerQueryKey(), {
    status: 200,
    data: buildOwner(surcharges),
    headers: new Headers(),
  });
  return renderWithProviders(<AccountContent />, { queryClient });
}

describe("AccountContent", () => {
  it("n'affiche rien tant que le propriétaire n'est pas chargé", () => {
    // Monter des formulaires vides puis les remplir ferait clignoter la
    // page et risquerait d'écraser une saisie rapide.
    renderWithProviders(<AccountContent />);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("empile les quatre cartes de la page", () => {
    afficher();

    expect(
      screen.getByRole("heading", { name: "Mon compte", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Informations personnelles simulées"),
    ).toBeInTheDocument();
    expect(screen.getByText("Adresse simulée")).toBeInTheDocument();
    expect(screen.getByText("Rappels simulés")).toBeInTheDocument();
    expect(screen.getByText("Connexion")).toBeInTheDocument();
  });

  it("partage le MEME état d'enregistrement entre les trois formulaires", () => {
    // C'est ce partage qui sérialise les envois : sans lui, deux cartes
    // pourraient enregistrer en même temps depuis une base identique, et
    // la seconde écraserait la première.
    recus.isSaving = [];
    afficher();

    expect(recus.isSaving).toHaveLength(3);
    expect(new Set(recus.isSaving).size).toBe(1);
  });

  it("affiche l'email en lecture seule et annonce ce qui n'existe pas", () => {
    // Sans cette phrase, quelqu'un qui cherche à changer son mot de
    // passe fouillerait les quatre cartes avant de conclure à tort.
    afficher({ email: "marie.dupont@example.test" });

    const champ = screen.getByLabelText("Email");
    expect(champ).toHaveValue("marie.dupont@example.test");
    expect(champ).toHaveAttribute("readonly");
    expect(screen.getByText(/arrivera prochainement/)).toBeInTheDocument();
  });

  it("ne porte plus la déconnexion : elle vit dans le menu du compte", () => {
    afficher();

    expect(
      screen.queryByRole("button", { name: /Se déconnecter/ }),
    ).not.toBeInTheDocument();
  });
});
