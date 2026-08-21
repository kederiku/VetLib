/**
 * Tests de l'indicateur de robustesse du mot de passe.
 *
 * Son rôle est de rendre visible AVANT la soumission une règle que le backend
 * appliquerait ensuite par un refus sec. Les seuils sont exactement le genre
 * de valeurs qu'un remaniement déplace d'un cran sans que personne ne s'en
 * aperçoive : on les fige ici, en les dérivant des constantes de la politique
 * pour qu'un changement de règle fasse évoluer les tests avec elle.
 *
 * Le dernier test est le plus important : il verrouille l'ABSENCE de règles de
 * composition. C'est un choix conforme à NIST SP 800-63B, contre-intuitif, et
 * la première chose que quelqu'un « corrigerait » de bonne foi.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PasswordStrengthHint } from "@/components/auth/password-strength-hint";
import {
  PASSWORD_MIN_LENGTH,
  STRONG_PASSWORD_LENGTH,
} from "@/lib/auth/password-policy";

/** Nombre de barres colorées (les autres restent neutres). */
function barresRemplies(): number {
  return document.querySelectorAll(".bg-destructive, .bg-brand").length;
}

describe("PasswordStrengthHint — champ vide", () => {
  it("affiche la consigne plutôt qu'un jugement", () => {
    // Avant la première frappe, annoncer « trop court » serait un reproche
    // adressé à quelqu'un qui n'a rien tapé.
    render(<PasswordStrengthHint password="" />);

    expect(
      screen.getByText(`Au moins ${PASSWORD_MIN_LENGTH} caractères.`),
    ).toBeInTheDocument();
    expect(barresRemplies()).toBe(0);
  });
});

describe("PasswordStrengthHint — niveaux", () => {
  it("signale un mot de passe trop court dès la première frappe", () => {
    render(<PasswordStrengthHint password="court" />);

    expect(screen.getByText("Trop court")).toBeInTheDocument();
    expect(barresRemplies()).toBe(1);
  });

  it("refuse encore un caractère avant le minimum", () => {
    // La limite doit être au bon endroit : juste en dessous, le backend
    // refuserait.
    render(
      <PasswordStrengthHint password={"a".repeat(PASSWORD_MIN_LENGTH - 1)} />,
    );
    expect(screen.getByText("Trop court")).toBeInTheDocument();
  });

  it("bascule à « Correct » exactement au minimum", () => {
    render(<PasswordStrengthHint password={"a".repeat(PASSWORD_MIN_LENGTH)} />);

    expect(screen.getByText("Correct")).toBeInTheDocument();
    expect(barresRemplies()).toBe(2);
  });

  it("n'accorde « Solide » qu'à partir du seuil dédié", () => {
    render(
      <PasswordStrengthHint
        password={"a".repeat(STRONG_PASSWORD_LENGTH - 1)}
      />,
    );
    expect(screen.getByText("Correct")).toBeInTheDocument();
  });

  it("accorde « Solide » au seuil, sur la seule longueur", () => {
    render(
      <PasswordStrengthHint password={"a".repeat(STRONG_PASSWORD_LENGTH)} />,
    );

    expect(screen.getByText("Solide")).toBeInTheDocument();
    expect(barresRemplies()).toBe(3);
  });

  it("ne réclame ni majuscule, ni chiffre, ni caractère spécial", () => {
    // Ce test verrouille un choix DELIBERE (NIST SP 800-63B) : imposer des
    // classes de caractères produit des variantes prévisibles sans gagner
    // d'entropie. Une phrase de passe tout en minuscules est le meilleur
    // niveau, et doit le rester.
    render(
      <PasswordStrengthHint password="mon chat rex adore les croquettes" />,
    );
    expect(screen.getByText("Solide")).toBeInTheDocument();
  });
});

describe("PasswordStrengthHint — accompagnement", () => {
  it("encourage la phrase de passe en permanence", () => {
    render(<PasswordStrengthHint password="court" />);
    expect(screen.getByText(/une phrase entière/)).toBeInTheDocument();
  });
});

describe("PasswordStrengthHint — accessibilité", () => {
  it("annonce le niveau sans interrompre la frappe", () => {
    // aria-live="polite" : le lecteur d'écran attend une pause avant
    // d'annoncer le changement, au lieu de couper la parole à chaque touche.
    render(<PasswordStrengthHint password="court" />);

    expect(screen.getByText("Trop court")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });

  it("masque les barres décoratives aux lecteurs d'écran", () => {
    // L'information est déjà portée par le texte : annoncer « trois barres
    // dont une remplie » n'apporterait rien et alourdirait la lecture.
    const { container } = render(<PasswordStrengthHint password="court" />);
    expect(container.querySelector("[aria-hidden]")).toBeInTheDocument();
  });
});
