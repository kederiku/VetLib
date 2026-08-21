/**
 * Tests de l'indicateur de robustesse du mot de passe.
 *
 * Ce composant guide la personne qui crée le compte gérant de la clinique —
 * celui qui aura tous les droits. Son rôle est de rendre visible AVANT la
 * soumission une règle que le backend appliquerait ensuite par un refus sec.
 * Les seuils (12 caractères pour être accepté, 14 avec mélange de casses et un
 * chiffre pour être « solide ») sont exactement le genre de valeurs qu'un
 * remaniement déplace d'un cran sans que personne ne s'en aperçoive.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PasswordStrengthHint } from "@/components/auth/password-strength-hint";

/** Nombre de barres colorées (les autres restent neutres). */
function barresRemplies(): number {
  return document.querySelectorAll(".bg-destructive, .bg-brand").length;
}

describe("PasswordStrengthHint — champ vide", () => {
  it("affiche la consigne plutôt qu'un jugement", () => {
    // Avant la première frappe, annoncer « trop court » serait un reproche
    // adressé à quelqu'un qui n'a rien tapé.
    render(<PasswordStrengthHint password="" />);

    expect(screen.getByText("Au moins 12 caractères.")).toBeInTheDocument();
    expect(barresRemplies()).toBe(0);
  });
});

describe("PasswordStrengthHint — niveaux", () => {
  it("signale un mot de passe trop court dès la première frappe", () => {
    render(<PasswordStrengthHint password="court" />);

    expect(screen.getByText("Trop court")).toBeInTheDocument();
    expect(barresRemplies()).toBe(1);
  });

  it("refuse encore à onze caractères", () => {
    // La limite doit être au bon endroit : à 11, le backend refuserait.
    render(<PasswordStrengthHint password={"a".repeat(11)} />);
    expect(screen.getByText("Trop court")).toBeInTheDocument();
  });

  it("bascule à « Correct » exactement à douze caractères", () => {
    render(<PasswordStrengthHint password={"a".repeat(12)} />);

    expect(screen.getByText("Correct")).toBeInTheDocument();
    expect(barresRemplies()).toBe(2);
  });

  it("n'accorde « Solide » qu'à partir de quatorze caractères", () => {
    // Treize caractères, même avec tous les ingrédients : pas encore.
    render(<PasswordStrengthHint password="Abcdefghijkl1" />);
    expect(screen.getByText("Correct")).toBeInTheDocument();
  });

  it("accorde « Solide » quand longueur, casses et chiffre sont réunis", () => {
    render(<PasswordStrengthHint password="Abcdefghijklm1" />);

    expect(screen.getByText("Solide")).toBeInTheDocument();
    expect(barresRemplies()).toBe(3);
  });

  it("refuse « Solide » à un mot de passe long mais monotone", () => {
    // Vingt lettres minuscules : long, mais sans majuscule ni chiffre.
    render(<PasswordStrengthHint password={"abcdefghijklmnopqrst"} />);
    expect(screen.getByText("Correct")).toBeInTheDocument();
  });

  it("refuse « Solide » sans chiffre", () => {
    render(<PasswordStrengthHint password="AbcdefghijklmN" />);
    expect(screen.getByText("Correct")).toBeInTheDocument();
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
