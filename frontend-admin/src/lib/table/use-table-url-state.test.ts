/**
 * Tests des analyseurs d'état d'URL des datatables.
 *
 * Ce sont les fonctions les plus exposées du front : leur entrée est une URL,
 * c'est-à-dire une chaîne que n'importe qui peut forger. `analyserTri` en
 * particulier alimente le paramètre `sort_by` d'une requête, donc un
 * `ORDER BY` côté serveur — d'où le test « une colonne inventée retombe sur
 * le défaut », qui est un test de sécurité et non de confort.
 *
 * Les fonctions sont exportées séparément du hook exprès : elles se testent
 * sans monter React, sans routeur simulé, et exhaustivement.
 */
import { describe, expect, it } from "vitest";

import {
  analyserFiltre,
  analyserPage,
  analyserRecherche,
  analyserSens,
  analyserTaille,
  analyserTri,
  TAILLES_DE_PAGE,
} from "@/lib/table/use-table-url-state";

describe("analyserPage", () => {
  it("lit un numéro de page valide", () => {
    expect(analyserPage("3")).toBe(3);
  });

  it("retombe sur 1 pour tout ce qui n'est pas un entier positif", () => {
    for (const brut of [null, "", "0", "-3", "abc", "1.5", "  "]) {
      expect(analyserPage(brut)).toBe(1);
    }
  });

  it("accepte la notation scientifique, qui désigne un entier légitime", () => {
    // Number("1e3") vaut 1000 : c'est un numéro de page valide, pas une
    // valeur forgée. Le plafond en dessous couvre les cas extrêmes.
    expect(analyserPage("1e3")).toBe(1000);
  });

  it("plafonne une page absurde plutôt que de calculer un offset délirant", () => {
    expect(analyserPage("999999999")).toBe(100_000);
  });
});

describe("analyserTaille", () => {
  it("accepte les tailles proposées par l'interface", () => {
    for (const taille of TAILLES_DE_PAGE) {
      expect(analyserTaille(String(taille))).toBe(taille);
    }
  });

  it("refuse toute autre taille, y compris au-delà du plafond du backend", () => {
    // 5000 provoquerait un 422 : la liste blanche évite l'aller-retour.
    for (const brut of [null, "", "13", "5000", "-10", "abc"]) {
      expect(analyserTaille(brut)).toBe(20);
    }
  });
});

describe("analyserRecherche", () => {
  it("supprime les espaces de bordure", () => {
    expect(analyserRecherche("  lilas  ")).toBe("lilas");
  });

  it("traite une saisie d'espaces comme une recherche vide", () => {
    expect(analyserRecherche("   ")).toBe("");
    expect(analyserRecherche(null)).toBe("");
  });

  it("tronque à la longueur acceptée par le backend", () => {
    expect(analyserRecherche("a".repeat(250))).toHaveLength(100);
  });
});

describe("analyserTri", () => {
  const AUTORISES = ["created_at", "name", "email"] as const;

  it("accepte une colonne de la liste blanche", () => {
    expect(analyserTri("name", AUTORISES)).toBe("name");
  });

  it("retombe sur la PREMIÈRE colonne autorisée pour une valeur inventée", () => {
    // Test de sécurité : cette valeur part en `sort_by`, donc dans un
    // ORDER BY. Rien d'inconnu ne doit pouvoir traverser.
    for (const brut of [null, "", "id", "password", "name; DROP TABLE users"]) {
      expect(analyserTri(brut, AUTORISES)).toBe("created_at");
    }
  });

  it("ne casse pas sur une liste blanche vide", () => {
    expect(analyserTri("name", [])).toBe("");
  });
});

describe("analyserSens", () => {
  it("accepte les deux sens du contrat", () => {
    expect(analyserSens("asc", "desc")).toBe("asc");
    expect(analyserSens("desc", "asc")).toBe("desc");
  });

  it("retombe sur le défaut fourni pour tout le reste", () => {
    for (const brut of [null, "", "ASC", "croissant", "1"]) {
      expect(analyserSens(brut, "desc")).toBe("desc");
    }
  });
});

describe("analyserFiltre", () => {
  const AUTORISES = ["tous", "active", "inactive"] as const;

  it("accepte une valeur de la liste blanche", () => {
    expect(analyserFiltre("inactive", AUTORISES, "tous")).toBe("inactive");
  });

  it("retombe sur le défaut pour une valeur inconnue", () => {
    expect(analyserFiltre("supprimees", AUTORISES, "tous")).toBe("tous");
    expect(analyserFiltre(null, AUTORISES, "tous")).toBe("tous");
  });
});
