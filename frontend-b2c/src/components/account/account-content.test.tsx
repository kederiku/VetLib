/**
 * Tests de la page « Mon compte ».
 *
 * Le composant assemble trois cartes et porte une seule décision propre : ne
 * rien afficher tant que le propriétaire n'est pas chargé. Sans cette garde,
 * la page monterait un formulaire de profil vide puis le remplirait — un
 * clignotement à chaque arrivée sur la page, et le risque qu'une frappe rapide
 * soit écrasée par les données qui arrivent.
 *
 * Les trois cartes ont leurs propres tests : on les simule ici pour ne vérifier
 * que l'assemblage.
 */
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AccountContent } from "@/components/account/account-content";
import { getGetCurrentOwnerQueryKey } from "@/lib/api/generated/owner-auth/owner-auth";
import { buildOwner } from "@/test/fixtures";
import { createTestQueryClient, renderWithProviders } from "@/test/render";

vi.mock("@/components/account/upcoming-appointments", () => ({
  UpcomingAppointments: () => <div>Aperçu des rendez-vous</div>,
}));
vi.mock("@/components/account/profile-form", () => ({
  ProfileForm: () => <div>Formulaire de profil</div>,
}));
vi.mock("@/components/auth/logout-button", () => ({
  LogoutButton: () => <button type="button">Se déconnecter</button>,
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
    // Monter un formulaire vide puis le remplir ferait clignoter la page
    // et risquerait d'écraser une saisie rapide.
    const { container } = renderWithProviders(<AccountContent />);
    // On interroge la sortie du COMPOSANT (aucun element de contenu), et
    // non la racine de rendu : celle-ci porte aussi le script anti-flash
    // de next-themes, monte par les providers de test.
    expect(container.querySelector("main")).toBeNull();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("accueille le propriétaire par son prénom", () => {
    afficher({ first_name: "Marie" });
    expect(
      screen.getByRole("heading", { name: "Bonjour Marie", level: 1 }),
    ).toBeInTheDocument();
  });

  it("assemble les trois cartes de la page", () => {
    afficher();

    expect(screen.getByText("Aperçu des rendez-vous")).toBeInTheDocument();
    expect(screen.getByText("Formulaire de profil")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Se déconnecter" }),
    ).toBeInTheDocument();
  });

  it("affiche l'email en lecture seule", () => {
    // L'email est l'identifiant du compte : il se consulte et se copie,
    // mais ne se modifie pas depuis cette page.
    afficher({ email: "marie.dupont@example.test" });

    const champ = screen.getByLabelText("Email");
    expect(champ).toHaveValue("marie.dupont@example.test");
    expect(champ).toHaveAttribute("readonly");
  });
});
