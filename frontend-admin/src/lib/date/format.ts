/**
 * Formatage des dates de la console.
 *
 * Règle d'or, identique aux deux portails : le backend renvoie des instants
 * ISO en UTC, le front ne fait que les FORMATER — il ne calcule jamais dans
 * un fuseau. Les instances Intl sont mémoïsées au niveau du module : en
 * construire une par cellule d'un tableau de cent lignes serait du
 * gaspillage pur.
 *
 * Le fuseau est explicite (`Europe/Paris`) et non celui du navigateur : deux
 * exploitants ne doivent pas lire deux dates différentes pour la même
 * inscription.
 */

const FUSEAU = "Europe/Paris";

const JOUR_COURT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: FUSEAU,
});

const JOUR_ET_HEURE = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: FUSEAU,
});

/** « 22/08/2026 » : format compact des colonnes de tableau. */
export function formatDateCourte(iso: string): string {
  return JOUR_COURT.format(new Date(iso));
}

/** « 22 août 2026 à 09:00 » : format lisible d'une fiche. */
export function formatDateLongue(iso: string): string {
  return JOUR_ET_HEURE.format(new Date(iso));
}
