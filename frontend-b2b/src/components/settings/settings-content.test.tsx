/**
 * Tests de la garde d'accès aux réglages.
 *
 * Les réglages pilotent la fiche clinique, les praticiens, les types de
 * rendez-vous et les horaires : ils sont réservés au gérant. Le composant
 * n'est PAS une protection — le backend refuse chaque endpoint sans la
 * permission — mais afficher les formulaires à une ASV la mènerait à une série
 * de refus incompréhensibles après avoir tout rempli.
 *
 * On amorce le cache plutôt que de simuler `useCurrentUser` : la vraie chaîne
 * de code est alors exercée, du `select` du hook jusqu'à `hasPermission`.
 */
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SettingsContent } from "@/components/settings/settings-content";
import { getGetCurrentUserQueryKey } from "@/lib/api/generated/auth/auth";
import { createTestQueryClient, renderWithProviders } from "@/test/render";
import { buildUser } from "@/test/fixtures";

/** Monte l'écran avec un utilisateur porteur des permissions données. */
function afficherAvecPermissions(permissions: string[]) {
  const queryClient = createTestQueryClient();
  // La forme { status, data, headers } est celle que renvoie le client HTTP :
  // le `select` du hook en extrait ensuite `data`.
  queryClient.setQueryData(getGetCurrentUserQueryKey(), {
    status: 200,
    data: buildUser({ permissions }),
    headers: new Headers(),
  });
  return renderWithProviders(<SettingsContent />, { queryClient });
}

describe("SettingsContent — sans la permission de gestion", () => {
  it("affiche un écran d'accès réservé plutôt que les formulaires", () => {
    afficherAvecPermissions(["appointment:read", "appointment:write"]);

    expect(
      screen.getByText("Accès réservé au gérant de la clinique"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Ma clinique" }),
    ).not.toBeInTheDocument();
  });

  it("propose une porte de sortie vers le tableau de bord", () => {
    // Un écran de refus sans lien de retour laisse l'utilisateur coincé,
    // avec pour seul recours le bouton « précédent » du navigateur.
    afficherAvecPermissions([]);

    expect(
      screen.getByRole("button", { name: "Retour au tableau de bord" }),
    ).toBeInTheDocument();
  });

  it("refuse aussi tant que la session n'est pas résolue", () => {
    // Défaut sûr : pendant l'instant où l'utilisateur n'est pas chargé, on
    // ne montre rien de réservé. L'inverse ferait apparaître brièvement les
    // formulaires à tout le monde.
    renderWithProviders(<SettingsContent />);

    expect(
      screen.getByText("Accès réservé au gérant de la clinique"),
    ).toBeInTheDocument();
  });
});

describe("SettingsContent — avec la permission de gestion", () => {
  it("affiche les quatre onglets de réglages", () => {
    afficherAvecPermissions(["clinic:manage"]);

    for (const onglet of [
      "Ma clinique",
      "Types de rendez-vous",
      "Praticiens",
      "Horaires",
    ]) {
      expect(screen.getByRole("tab", { name: onglet })).toBeInTheDocument();
    }
  });

  it("masque l'écran d'accès réservé", () => {
    afficherAvecPermissions(["clinic:manage"]);

    expect(
      screen.queryByText("Accès réservé au gérant de la clinique"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Réglages", level: 1 }),
    ).toBeInTheDocument();
  });

  it("ouvre sur la fiche clinique", () => {
    // C'est le réglage le plus consulté : il doit être l'onglet actif.
    afficherAvecPermissions(["clinic:manage"]);

    expect(screen.getByRole("tab", { name: "Ma clinique" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
