/**
 * Dates et heures du portail B2B : formatage et helpers de calendrier.
 *
 * Règle d'or du projet : le backend renvoie tous les instants en ISO
 * UTC ; le frontend ne CALCULE jamais dans un fuseau, il FORMATE via
 * Intl.DateTimeFormat avec un timeZone explicite. Ainsi un membre du
 * staff en déplacement (fuseau différent de la clinique) voit les
 * horaires de la clinique, pas les siens.
 *
 * Les formatteurs Intl sont créés UNE fois au chargement du module
 * (mémoïsation) : leur construction est coûteuse (chargement des
 * données de locale), et l'agenda formate des dizaines d'horaires par
 * rendu.
 */
import { addDays, format as formatDateFns, startOfWeek } from "date-fns";

// Fuseau de référence de l'affichage. Le backend stocke la timezone de
// CHAQUE clinique (table clinics) ; tant que le produit cible la France,
// une constante suffit côté front. Le jour où des cliniques hors
// Europe/Paris existeront, cette constante deviendra une donnée lue de
// GET /clinics/me.
export const CLINIC_TIME_ZONE = "Europe/Paris";

// "lundi 24 août" : titres de jour dans l'agenda.
const dayLongFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: CLINIC_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});

// "09:30" : heure d'un rendez-vous.
const timeFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: CLINIC_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

// "24 août 2026" ou, via formatRange, "24-30 août 2026" : libellé de la
// période affichée dans la barre d'outils de l'agenda.
const dateRangeFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: CLINIC_TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
});

// Formatteur interne de toParisDayKey : year/month/day sur 2 chiffres,
// dont on recompose une clé stable YYYY-MM-DD via formatToParts.
const dayKeyFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: CLINIC_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "lundi 24 août" — accepte un Date ou une chaîne ISO du backend. */
export function formatDayLong(date: Date | string): string {
  return dayLongFormatter.format(
    typeof date === "string" ? new Date(date) : date,
  );
}

/** "09:30" — heure locale clinique d'un instant ISO UTC. */
export function formatTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

/**
 * "09:30 - 10:00" — plage horaire d'un rendez-vous. formatRange gère la
 * ponctuation de la locale (tiret, espaces) mieux qu'une concaténation.
 */
export function formatTimeRange(startIso: string, endIso: string): string {
  return timeFormatter.formatRange(new Date(startIso), new Date(endIso));
}

/**
 * Libellé de la période affichée ("24-30 août 2026", ou "24 août 2026"
 * en vue jour : formatRange fusionne de lui-même deux dates égales).
 */
export function formatDateRangeLabel(from: Date, to: Date): string {
  return dateRangeFormatter.formatRange(from, to);
}

/**
 * Clé de regroupement par jour CLINIQUE d'un instant ISO UTC : "2026-08-24".
 *
 * JAMAIS getDate()/getMonth() ici : ces méthodes lisent le fuseau du
 * NAVIGATEUR. Un rendez-vous à 00:30 heure de Paris (22:30 UTC la
 * veille) serait rangé dans le mauvais jour pour un utilisateur hors de
 * France. formatToParts avec timeZone Europe/Paris donne le jour vu par
 * la clinique, quel que soit le poste qui affiche.
 */
export function toParisDayKey(iso: string): string {
  const parts = dayKeyFormatter.formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * Lundi de la semaine contenant `date` (convention française :
 * weekStartsOn 1 ; le défaut de date-fns est dimanche, convention US).
 */
export function getWeekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

// Réexport : les composants d'agenda avancent/reculent de N jours sans
// importer date-fns directement (un seul point d'entrée date, ce module).
export { addDays };

/**
 * "2026-08-24" pour les query params date_from/date_to de l'API.
 *
 * date-fns format (et non toISOString) : toISOString convertit en UTC et
 * peut donc changer de jour près de minuit ; format lit les champs
 * LOCAUX du Date, ce qui correspond au jour que l'utilisateur regarde.
 */
export function toIsoDate(date: Date): string {
  return formatDateFns(date, "yyyy-MM-dd");
}

/**
 * Instant "sûr" pour AFFICHER un jour de calendrier via les formatteurs
 * Europe/Paris ci-dessus.
 *
 * Les Dates de navigation (ancre, bornes de semaine) vivent dans le
 * fuseau du NAVIGATEUR : minuit local du 24 août vu depuis Tokyo, c'est
 * encore le 23 août à Paris — le titre du jour serait décalé d'un jour
 * pour un poste à l'est de la France. On réancre donc le jour civil
 * (toIsoDate) à MIDI UTC : 12:00 UTC tombe toujours le même jour en
 * Europe/Paris (UTC+1 ou +2), quel que soit le fuseau du poste.
 */
export function toParisDisplayDate(day: Date): Date {
  return new Date(`${toIsoDate(day)}T12:00:00Z`);
}

// Jours de la semaine, convention backend : 0 = lundi ... 6 = dimanche
// (WeeklyRangePayload.weekday). Sert au formulaire des horaires.
export const WEEKDAYS = [
  { value: 0, label: "Lundi" },
  { value: 1, label: "Mardi" },
  { value: 2, label: "Mercredi" },
  { value: 3, label: "Jeudi" },
  { value: 4, label: "Vendredi" },
  { value: 5, label: "Samedi" },
  { value: 6, label: "Dimanche" },
] as const;
