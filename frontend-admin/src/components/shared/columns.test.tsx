/**
 * Tests des définitions de colonnes, traitées COMME DES DONNÉES.
 *
 * Les colonnes sont des objets, pas des composants : on peut donc vérifier
 * leurs invariants sans rendre une seule ligne de tableau, et vite. Trois
 * invariants comptent, et chacun protège d'un bug silencieux :
 *
 * 1. l'ensemble des colonnes TRIABLES est exactement la liste blanche du
 *    tri. Une colonne triable absente de la liste blanche produirait un
 *    en-tête cliquable dont le tri retomberait sur le défaut — un tri qui
 *    « ne marche pas » sans le moindre message ;
 * 2. toute colonne porte une `meta.className`, faute de quoi sa largeur
 *    dépend du contenu et le tableau danse d'une page à l'autre ;
 * 3. les identifiants de colonne sont uniques (TanStack les utilise comme
 *    clés de rendu).
 */
import { describe, expect, it } from "vitest";

import {
  colonnesCliniques,
  TRIS_CLINIQUES,
} from "@/components/clinics/clinics-columns";
import {
  colonnesProprietaires,
  TRIS_PROPRIETAIRES,
} from "@/components/owners/owners-columns";
import {
  colonnesPersonnel,
  TRIS_PERSONNEL,
  TRIS_PERSONNEL_CLINIQUE,
} from "@/components/staff/staff-columns";
import { buildTableUrlState } from "@/test/fixtures";

const etat = buildTableUrlState();

/** Colonnes dont l'en-tête est cliquable (`enableSorting` non désactivé). */
function idsTriables(
  colonnes: { id?: string; enableSorting?: boolean }[],
): string[] {
  return colonnes
    .filter((colonne) => colonne.enableSorting !== false)
    .map((colonne) => colonne.id ?? "");
}

const JEUX = [
  {
    nom: "cliniques",
    colonnes: colonnesCliniques(etat),
    tris: TRIS_CLINIQUES,
  },
  {
    nom: "propriétaires",
    colonnes: colonnesProprietaires(etat),
    tris: TRIS_PROPRIETAIRES,
  },
  {
    nom: "personnel (liste transverse)",
    colonnes: colonnesPersonnel(etat, { avecClinique: true }),
    tris: TRIS_PERSONNEL,
  },
  {
    nom: "personnel (fiche clinique)",
    colonnes: colonnesPersonnel(etat, { avecClinique: false }),
    tris: TRIS_PERSONNEL_CLINIQUE,
  },
];

describe.each(JEUX)("colonnes des $nom", ({ colonnes, tris }) => {
  it("a exactement la liste blanche de tri pour colonnes triables", () => {
    expect(idsTriables(colonnes).toSorted()).toEqual([...tris].toSorted());
  });

  it("donne une largeur à chaque colonne", () => {
    for (const colonne of colonnes) {
      expect(colonne.meta?.className, `colonne ${colonne.id}`).toBeTruthy();
    }
  });

  it("n'a aucun identifiant de colonne en double", () => {
    const ids = colonnes.map((colonne) => colonne.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("finit par la colonne d'actions", () => {
    expect(colonnes.at(-1)?.id).toBe("actions");
  });
});

describe("colonnes du personnel", () => {
  it("retire la colonne Clinique sur la fiche d'une clinique", () => {
    // Y répéter cent fois le même nom de clinique serait du bruit ; et la
    // colonne retirée doit l'être AUSSI de la liste blanche de tri, sinon
    // `?tri=clinic_name` resterait accepté sur un écran qui ne l'affiche pas.
    const surFiche = colonnesPersonnel(etat, { avecClinique: false });
    expect(surFiche.map((colonne) => colonne.id)).not.toContain("clinic_name");
    expect(TRIS_PERSONNEL_CLINIQUE).not.toContain("clinic_name");
    expect(TRIS_PERSONNEL).toContain("clinic_name");
  });
});
