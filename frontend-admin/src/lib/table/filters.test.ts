/**
 * Tests de la traduction des filtres d'URL vers les paramètres d'API.
 *
 * Trois fonctions minuscules, mais elles sont la frontière entre une chaîne
 * venue de l'URL et un paramètre typé du client généré. Sans elles, un `as`
 * suffirait à faire partir `?statut=nimportequoi` vers le backend.
 *
 * Le point le plus facile à casser, et le plus coûteux : « absence de
 * filtre » doit valoir `undefined` et JAMAIS `null`. Le client Orval
 * sérialise un `null` explicite en la chaîne "null" — ce qui donne un 422
 * sur un paramètre enum, et une recherche du mot « null » (donc zéro
 * résultat, sans erreur) sur un paramètre texte. Ces assertions
 * `toBeUndefined()` sont donc littérales, pas une préférence de style.
 */
import { describe, expect, it } from "vitest";

import {
  FILTRE_TOUS,
  rechercheVersApi,
  roleVersApi,
  statutVersApi,
} from "@/lib/table/filters";

describe("statutVersApi", () => {
  it("laisse passer les deux statuts du contrat", () => {
    expect(statutVersApi("active")).toBe("active");
    expect(statutVersApi("inactive")).toBe("inactive");
  });

  it("traduit « tous » en absence de paramètre, et non en null", () => {
    expect(statutVersApi(FILTRE_TOUS)).toBeUndefined();
  });

  it("refuse une valeur forgée", () => {
    expect(statutVersApi("supprime")).toBeUndefined();
    expect(statutVersApi("")).toBeUndefined();
  });
});

describe("roleVersApi", () => {
  it("laisse passer les trois rôles du contrat", () => {
    expect(roleVersApi("asv")).toBe("asv");
    expect(roleVersApi("veterinarian")).toBe("veterinarian");
    expect(roleVersApi("manager")).toBe("manager");
  });

  it("traduit « tous » en absence de paramètre, et non en null", () => {
    expect(roleVersApi(FILTRE_TOUS)).toBeUndefined();
  });

  it("refuse un rôle inventé, y compris un rôle d'un autre espace", () => {
    // « platform » est le `kind` du jeton de cette console, pas un rôle de
    // personnel de clinique : il ne doit pas franchir cette frontière.
    expect(roleVersApi("platform")).toBeUndefined();
    expect(roleVersApi("admin")).toBeUndefined();
  });
});

describe("rechercheVersApi", () => {
  it("laisse passer un terme de recherche", () => {
    expect(rechercheVersApi("lilas")).toBe("lilas");
  });

  it("omet le paramètre plutôt que d'envoyer une chaîne vide ou null", () => {
    // Un `null` deviendrait `?search=null` : une recherche du mot « null »,
    // donc zéro résultat, sans la moindre erreur pour le signaler.
    expect(rechercheVersApi("")).toBeUndefined();
  });
});
