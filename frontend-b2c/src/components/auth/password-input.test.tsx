/**
 * Tests du champ de mot de passe et de sa bascule d'affichage.
 *
 * Deux choses valent d'être verrouillées ici. D'abord le `type` de l'input :
 * s'il restait à "text", le mot de passe s'afficherait en clair à l'écran —
 * une régression de confidentialité qu'une capture d'écran de recette ne
 * montrerait pas forcément. Ensuite l'étiquette du bouton, qui doit décrire
 * l'action À VENIR et non l'état courant.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { PasswordInput } from "@/components/auth/password-input";

describe("PasswordInput", () => {
  it("masque le mot de passe par défaut", () => {
    const { container } = render(<PasswordInput defaultValue="secret" />);

    expect(container.querySelector("input")).toHaveAttribute(
      "type",
      "password",
    );
    expect(
      screen.getByRole("button", { name: "Afficher le mot de passe" }),
    ).toBeInTheDocument();
  });

  it("bascule en clair puis revient masqué", async () => {
    const user = userEvent.setup();
    const { container } = render(<PasswordInput defaultValue="secret" />);
    const champ = container.querySelector("input");

    await user.click(
      screen.getByRole("button", { name: "Afficher le mot de passe" }),
    );
    expect(champ).toHaveAttribute("type", "text");

    await user.click(
      screen.getByRole("button", { name: "Masquer le mot de passe" }),
    );
    expect(champ).toHaveAttribute("type", "password");
  });

  it("sort le bouton de l'ordre de tabulation", () => {
    // Au clavier, Tab doit passer du mot de passe au champ suivant sans
    // s'arrêter sur l'oeil : montrer le mot de passe n'est utile qu'à la
    // souris, et le détour ralentirait la saisie.
    render(<PasswordInput />);

    expect(screen.getByRole("button")).toHaveAttribute("tabindex", "-1");
  });

  it("transmet les propriétés du champ sous-jacent", () => {
    // Le composant est branché à react-hook-form : name, placeholder et
    // autoComplete doivent traverser sans être avalés.
    const { container } = render(
      <PasswordInput
        name="password"
        placeholder="Votre mot de passe"
        autoComplete="new-password"
      />,
    );
    const champ = container.querySelector("input");

    expect(champ).toHaveAttribute("name", "password");
    expect(champ).toHaveAttribute("placeholder", "Votre mot de passe");
    expect(champ).toHaveAttribute("autocomplete", "new-password");
  });

  it("laisse saisir du texte", async () => {
    const { container } = render(<PasswordInput />);
    const champ = container.querySelector("input");

    await userEvent.setup().type(champ!, "motdepasse");

    expect(champ).toHaveValue("motdepasse");
  });
});
