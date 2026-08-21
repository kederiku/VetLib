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

// "lun. 24" : en-têtes de colonnes de la grille agenda (place comptée).
const dayShortFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: CLINIC_TIME_ZONE,
  weekday: "short",
  day: "numeric",
});

/** "lundi 24 août" — accepte un Date ou une chaîne ISO du backend. */
export function formatDayLong(date: Date | string): string {
  return dayLongFormatter.format(
    typeof date === "string" ? new Date(date) : date,
  );
}

/** "lun. 24" — en-tête compact de colonne de la grille agenda. */
export function formatDayShort(date: Date | string): string {
  return dayShortFormatter.format(
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

// Formatteur interne de getParisMinutesOfDay : heure et minute vues de
// Paris, en cycle 0-23 (h23 évite le piège "24:xx" de certains moteurs
// avec h24, et l'ambiguïté AM/PM de la locale).
const parisTimePartsFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: CLINIC_TIME_ZONE,
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Minutes écoulées depuis minuit, HEURE DE PARIS, d'un instant ISO UTC.
 *
 * C'est LA fonction de positionnement vertical de la grille agenda : un
 * bloc à 09:30 heure clinique doit s'afficher à 9,5 h de haut sur tous
 * les postes. new Date(iso).getHours() lirait le fuseau du NAVIGATEUR
 * et décalerait tous les blocs pour un utilisateur hors de France.
 */
export function getParisMinutesOfDay(iso: string): number {
  const parts = parisTimePartsFormatter.formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return part("hour") * 60 + part("minute");
}

/** Minutes depuis minuit de l'instant PRESENT, heure de Paris (ligne "maintenant"). */
export function parisNowMinutes(): number {
  return getParisMinutesOfDay(new Date().toISOString());
}

// Formatteur interne de parisOffsetMinutes : "GMT+02:00" (heure d'ete)
// ou "GMT+01:00" (heure d'hiver) a l'instant demande.
const parisOffsetFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CLINIC_TIME_ZONE,
  timeZoneName: "longOffset",
});

/** Decalage de Paris par rapport a UTC, en minutes, a un instant donne. */
function parisOffsetMinutes(instant: Date): number {
  const label =
    parisOffsetFormatter
      .formatToParts(instant)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT+00:00";
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(label);
  if (match === null) {
    // "GMT" tout court = UTC+0 (jamais le cas pour Paris, filet de securite).
    return 0;
  }
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

/**
 * Instant ISO UTC a partir d'un jour civil et d'une heure MURALE de la
 * clinique : ("2026-08-20", "09:30") -> "2026-08-20T07:30:00.000Z".
 *
 * C'est l'operation INVERSE de getParisMinutesOfDay, et elle est
 * indispensable a l'ECRITURE : toutes les heures que l'interface
 * manipule (cellules de la grille, creneaux proposes, saisie libre)
 * sont des heures murales de la clinique. Les recombiner avec
 * Date.setHours ecrirait des champs LOCAUX au navigateur : depuis un
 * poste hors de France, le rendez-vous partirait a la mauvaise heure
 * et serait stocke faux (le backend ne reprojette rien).
 *
 * Methode : on suppose d'abord que l'heure murale est de l'UTC, on lit
 * le decalage de Paris a cet instant approche, puis on corrige. La
 * seconde lecture rattrape les nuits de changement d'heure, ou le
 * decalage de l'instant approche differe de celui de l'instant reel.
 */
export function parisWallTimeToIso(dayKey: string, time: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);

  const asIfUtc = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
  const firstGuess = asIfUtc - parisOffsetMinutes(new Date(asIfUtc)) * 60_000;
  const corrected =
    asIfUtc - parisOffsetMinutes(new Date(firstGuess)) * 60_000;
  return new Date(corrected).toISOString();
}

/**
 * Le jour calendaire d'AUJOURD'HUI à Paris, sous forme d'objet Date
 * local à minuit — le pont entre "maintenant" et le monde des Date
 * locales de la navigation (ancre d'agenda, cases de calendrier).
 *
 * new Date() seul ne suffit pas : ses composantes locales reflètent le
 * fuseau du NAVIGATEUR. À 1 h du matin à Paris, un poste à Montréal
 * serait encore "hier". On détermine donc le jour de Paris
 * (toParisDayKey) puis on le reconstruit en Date locale, comparable aux
 * autres Dates de navigation. (Porté du portail B2C.)
 */
export function parisToday(): Date {
  const [year, month, day] = toParisDayKey(new Date().toISOString())
    .split("-")
    .map(Number);
  return new Date(year, month - 1, day);
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
