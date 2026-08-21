/**
 * Tests de la page « Mon compte ».
 *
 * Le composant assemble deux blocs et porte une seule décision propre :
 * ne rien afficher tant que le propriétaire n'est pas chargé. Sans cette
 * garde, la page monterait un formulaire de profil vide puis le
 * remplirait — un clignotement à chaque arrivée, et le risque qu'une
 * frappe rapide soit écrasée par les données qui arrivent.
 *
 * Depuis la refonte, la page ne porte plus ni l'aperçu des rendez-vous
 * (parti au tableau de bord) ni la déconnexion (partie au menu du compte
 * dans le header) : ces deux absences sont testées, parce qu'un
 * doublon serait invisible en relecture de diff.
 */
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AccountContent } from "@/components/account/account-content";
import { getGetCurrentOwnerQueryKey } from "@/lib/api/generated/owner-auth/owner-auth";
import { buildOwner } from "@/test/fixtures";
import { createTestQueryClient, renderWithProviders } from "@/test/render";

// Le formulaire de profil a ses propres tests : on le simule ici pour ne
// vérifier que l'assemblage.
vi.mock("@/components/account/profile-form", () => ({
  ProfileForm: () => <div>Formulaire de profil</div>,
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
    renderWithProviders(<AccountContent />);
    // On interroge la sortie du COMPOSANT et non la racine de rendu :
    // celle-ci porte aussi le script anti-flash de next-themes, monté
    // par les providers de test.
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("titre la page et assemble ses deux blocs", () => {
    afficher();

    expect(
      screen.getByRole("heading", { name: "Mon compte", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Formulaire de profil")).toBeInTheDocument();
    expect(screen.getByText("Connexion")).toBeInTheDocument();
  });

  it("affiche l'email en lecture seule", () => {
    // L'email est l'identifiant du compte : il se consulte et se copie,
    // mais ne se modifie pas depuis cette page.
    afficher({ email: "marie.dupont@example.test" });

    const champ = screen.getByLabelText("Email");
    expect(champ).toHaveValue("marie.dupont@example.test");
    expect(champ).toHaveAttribute("readonly");
  });

  it("ne porte plus la déconnexion : elle vit dans le menu du compte", () => {
    // Deux points de déconnexion dans l'interface seraient un doublon
    // invisible en relecture de diff.
    afficher();

    expect(
      screen.queryByRole("button", { name: /Se déconnecter/ }),
    ).not.toBeInTheDocument();
  });

  it("ne duplique pas l'aperçu des rendez-vous du tableau de bord", () => {
    afficher();

    expect(screen.queryByText(/Prochain/)).not.toBeInTheDocument();
  });
});
