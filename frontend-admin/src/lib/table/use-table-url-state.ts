/**
 * État d'une datatable, stocké dans l'URL et nulle part ailleurs.
 *
 * Pourquoi l'URL plutôt qu'un `useState` : une liste filtrée devient
 * partageable et rechargeable. « Regarde les cliniques suspendues » se
 * transmet en collant un lien, et un rafraîchissement ne renvoie pas
 * l'utilisateur au début. C'est la convention déjà en place dans les deux
 * portails (voir `use-agenda-url-state.ts` du B2B), généralisée ici.
 *
 * Trois règles, reprises telles quelles de cette convention :
 *
 * 1. **Parsing DÉFENSIF.** Une URL est une saisie utilisateur comme une
 *    autre : elle peut contenir `?page=-3`, `?tri=id_secret` ou
 *    `?taille=99999`. Chaque valeur passe par un analyseur qui retombe sur
 *    le défaut. La liste blanche de tri est celle de l'écran, qui est
 *    elle-même celle du backend : aucune chaîne inventée ne peut atteindre
 *    un `ORDER BY`.
 * 2. **Les défauts sont ABSENTS de l'URL.** `/cliniques` reste l'adresse au
 *    repos ; on n'écrit un paramètre que s'il s'écarte du défaut.
 * 3. **`router.replace`, jamais `push`, et `scroll: false`.** Filtrer n'est
 *    pas une étape de navigation : le bouton « précédent » ne doit pas
 *    rejouer chaque frappe de la recherche, et la page ne doit pas remonter
 *    en haut à chaque changement de tri.
 *
 * Les noms de paramètres sont français, comme les URLs de cette console :
 * `?page=2&q=lilas&tri=created_at&sens=desc&taille=50`.
 */
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

/** Tailles de page proposées. Le maximum reste sous le plafond de 100 du backend. */
export const TAILLES_DE_PAGE = [10, 20, 50, 100] as const;

const TAILLE_PAR_DEFAUT = 20;
const RECHERCHE_MAX = 100;

/** Parseurs exportés pour être testés SANS monter le hook (logique pure). */
export function analyserPage(brut: string | null): number {
  const valeur = Number(brut);
  // Number("") vaut 0 et Number("abc") vaut NaN : les deux retombent ici.
  if (!Number.isInteger(valeur) || valeur < 1) return 1;
  // Plafond de bon sens : une URL forgée avec page=1e9 ne doit pas produire
  // un offset absurde côté serveur.
  return Math.min(valeur, 100_000);
}

export function analyserTaille(brut: string | null): number {
  const valeur = Number(brut);
  return (TAILLES_DE_PAGE as readonly number[]).includes(valeur)
    ? valeur
    : TAILLE_PAR_DEFAUT;
}

export function analyserRecherche(brut: string | null): string {
  // trim : "   " est une recherche vide, pas une recherche sur des espaces.
  // Troncature : le backend refuse au-delà de 100 caractères (422), autant
  // ne pas le solliciter pour rien.
  return (brut ?? "").trim().slice(0, RECHERCHE_MAX);
}

export function analyserTri(brut: string | null, autorises: readonly string[]): string {
  const defaut = autorises[0] ?? "";
  return brut !== null && autorises.includes(brut) ? brut : defaut;
}

export function analyserSens(brut: string | null, defaut: "asc" | "desc"): "asc" | "desc" {
  return brut === "asc" || brut === "desc" ? brut : defaut;
}

export function analyserFiltre(
  brut: string | null,
  autorises: readonly string[],
  defaut: string,
): string {
  return brut !== null && autorises.includes(brut) ? brut : defaut;
}

export type TableUrlState = {
  /** Page courante, 1-indexée (ce que l'humain lit dans l'URL). */
  page: number;
  /** Taille de page. */
  taille: number;
  /** Terme de recherche, déjà nettoyé. */
  q: string;
  /** Colonne de tri, garantie dans la liste blanche. */
  tri: string;
  sens: "asc" | "desc";
  /** Décalage 0-indexé, ce qu'attend l'API. La conversion vit ICI, une fois. */
  offset: number;
  changerPage: (page: number) => void;
  changerTaille: (taille: number) => void;
  changerRecherche: (q: string) => void;
  /** Bascule le tri : même colonne -> inverse le sens, sinon repart en asc. */
  changerTri: (colonne: string) => void;
  /** Lit un filtre additionnel (statut, rôle...) de façon défensive. */
  lireFiltre: (nom: string, autorises: readonly string[], defaut: string) => string;
  /** Écrit un filtre additionnel, et revient à la première page. */
  changerFiltre: (nom: string, valeur: string, defaut: string) => void;
};

export function useTableUrlState(options: {
  colonnesTriables: readonly string[];
  triParDefaut: string;
  sensParDefaut?: "asc" | "desc";
}): TableUrlState {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { colonnesTriables, triParDefaut, sensParDefaut = "asc" } = options;

  const page = analyserPage(searchParams.get("page"));
  const taille = analyserTaille(searchParams.get("taille"));
  const q = analyserRecherche(searchParams.get("q"));
  const tri = analyserTri(searchParams.get("tri"), [
    // Le tri par défaut est mis EN TÊTE de la liste blanche : c'est lui que
    // l'analyseur rend quand la valeur d'URL est inconnue.
    triParDefaut,
    ...colonnesTriables.filter((colonne) => colonne !== triParDefaut),
  ]);
  const sens = analyserSens(searchParams.get("sens"), sensParDefaut);

  const ecrire = useCallback(
    (modifications: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [cle, valeur] of Object.entries(modifications)) {
        // null = retirer le paramètre. C'est ainsi que les valeurs par
        // défaut restent absentes de l'URL.
        if (valeur === null) params.delete(cle);
        else params.set(cle, valeur);
      }
      const requete = params.toString();
      router.replace(requete === "" ? "?" : `?${requete}`, { scroll: false });
    },
    [router, searchParams],
  );

  return useMemo<TableUrlState>(
    () => ({
      page,
      taille,
      q,
      tri,
      sens,
      // 1-indexé dans l'URL (lisible), 0-indexé vers l'API (ce que veut SQL).
      // La conversion est faite ici et NULLE PART ailleurs : c'est le
      // terrain de jeu classique des erreurs de décalage de un.
      offset: (page - 1) * taille,
      changerPage: (valeur) => ecrire({ page: valeur <= 1 ? null : String(valeur) }),
      changerTaille: (valeur) =>
        ecrire({
          taille: valeur === TAILLE_PAR_DEFAUT ? null : String(valeur),
          // Changer la taille invalide le numéro de page : la page 5 en
          // taille 10 n'a rien à voir avec la page 5 en taille 100.
          page: null,
        }),
      changerRecherche: (valeur) => {
        const nettoye = valeur.trim().slice(0, RECHERCHE_MAX);
        // Retour à la première page : sans cela, chercher depuis la page 4
        // afficherait un tableau vide alors qu'il y a des résultats.
        ecrire({ q: nettoye === "" ? null : nettoye, page: null });
      },
      changerTri: (colonne) => {
        const memeColonne = colonne === tri;
        const nouveauSens = memeColonne && sens === "asc" ? "desc" : "asc";
        ecrire({
          tri: colonne === triParDefaut ? null : colonne,
          sens: nouveauSens === sensParDefaut ? null : nouveauSens,
          page: null,
        });
      },
      lireFiltre: (nom, autorises, defaut) =>
        analyserFiltre(searchParams.get(nom), autorises, defaut),
      changerFiltre: (nom, valeur, defaut) =>
        ecrire({ [nom]: valeur === defaut ? null : valeur, page: null }),
    }),
    [page, taille, q, tri, sens, triParDefaut, sensParDefaut, ecrire, searchParams],
  );
}
