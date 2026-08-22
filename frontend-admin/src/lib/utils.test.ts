/**
 * Tests de `cn`, l'assembleur de classes CSS utilisé par tout l'espace clinique.
 *
 * Sa valeur n'est pas de concaténer des chaînes — c'est de RÉSOUDRE les
 * conflits Tailwind : quand un composant passe `px-4` à un enfant qui déclare
 * déjà `px-2`, seule la dernière doit survivre. Sans cela, l'ordre de la
 * feuille de styles décide, et le résultat change au gré du build.
 */
import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("assemble plusieurs classes", () => {
    expect(cn("rounded", "border")).toBe("rounded border");
  });

  it("fait gagner la dernière classe Tailwind en conflit", () => {
    // C'est LA raison d'être de tailwind-merge : sans lui, la classe
    // appliquée dépendrait de l'ordre dans la feuille de styles générée.
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-sm text-muted-foreground", "text-lg")).toBe(
      "text-muted-foreground text-lg",
    );
  });

  it("ignore les valeurs conditionnelles fausses", () => {
    // Le motif `cn("base", actif && "on")` est partout dans le projet.
    expect(cn("base", false && "actif", undefined, null, "")).toBe("base");
  });

  it("accepte les objets et les tableaux de clsx", () => {
    expect(cn(["a", "b"], { c: true, d: false })).toBe("a b c");
  });
});
