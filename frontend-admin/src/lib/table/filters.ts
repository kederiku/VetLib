/**
 * Traduction des filtres d'URL en paramètres d'API.
 *
 * Deux besoins minuscules, mais aucun des deux n'est cosmétique.
 *
 * 1. Dans l'URL, « pas de filtre » s'écrit `tous` — un `Select` doit
 *    toujours avoir une valeur — alors que l'API attend l'ABSENCE du
 *    paramètre.
 * 2. Ces valeurs viennent d'une URL. Les remettre dans le type de l'API par
 *    un `as` reviendrait à dire à TypeScript « fais-moi confiance » sur une
 *    saisie utilisateur. Ces fonctions convertissent en VÉRIFIANT.
 *
 * PIÈGE : « absence » s'écrit `undefined`, JAMAIS `null`. Le client généré
 * par Orval sérialise un `null` explicite en la CHAÎNE "null"
 * (`value === null ? "null" : String(value)`), ce qui produirait
 * `?status=null` — un 422 sur un paramètre typé par une enum, et, pire, une
 * recherche du mot « null » sur un paramètre texte, donc zéro résultat sans
 * la moindre erreur. Seul `undefined` est omis de la chaîne de requête.
 */
import { AccountStatus, Role } from "@/lib/api/generated/vetoLibAPI.schemas";

/** Valeur d'URL signifiant « pas de filtre » (partagée par tous les écrans). */
export const FILTRE_TOUS = "tous";

export function statutVersApi(valeur: string): AccountStatus | undefined {
  return valeur === AccountStatus.active || valeur === AccountStatus.inactive
    ? valeur
    : undefined;
}

export function roleVersApi(valeur: string): Role | undefined {
  return Object.values<string>(Role).includes(valeur)
    ? (valeur as Role)
    : undefined;
}

/** Terme de recherche, ou `undefined` quand le champ est vide. */
export function rechercheVersApi(valeur: string): string | undefined {
  return valeur === "" ? undefined : valeur;
}
