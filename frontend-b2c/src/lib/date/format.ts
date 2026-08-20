/**
 * Formatage des dates et heures du portail B2C.
 *
 * REGLE D'OR : le backend renvoie tous les instants en ISO UTC (ex :
 * "2026-08-20T12:30:00Z") et le front ne fait que FORMATER, jamais
 * calculer. Le fuseau "Europe/Paris" est explicite dans chaque
 * formatteur : l'affichage est donc identique quel que soit le fuseau du
 * navigateur du visiteur (un propriétaire en déplacement voit l'heure de
 * la clinique, pas la sienne).
 *
 * Les Intl.DateTimeFormat sont construits UNE fois au chargement du
 * module (mémoïsation) : leur construction est coûteuse, et les listes
 * de rendez-vous en appellent des dizaines par rendu.
 *
 * Deux fonctions de "clé de jour" ferment ce module : la jointure entre
 * le calendrier (objets Date locaux de react-day-picker) et les créneaux
 * (chaînes ISO UTC de l'API) se fait UNIQUEMENT par ces clés
 * "YYYY-MM-DD", jamais en comparant des objets Date entre eux (les
 * comparaisons de Date mélangeraient les fuseaux et créeraient des bugs
 * de bord de journée : un créneau à 00:30 heure de Paris tombe la
 * VEILLE en UTC).
 */

// Heure seule, ex : "14:30". fr-FR avec hour/minute 2-digit produit le
// format 24 h avec les deux-points, sans "h" typographique.
const timeFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
});

// Date complète avec jour de semaine, ex : "jeudi 20 août 2026".
const dateLongFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

// Date compacte pour les listes denses, ex : "20 août 2026".
const dateShortFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  day: "numeric",
  month: "short",
  year: "numeric",
});

// Date et heure combinées, ex : "20 août 2026, 14:30".
const dateTimeFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

// Composantes annee/mois/jour du jour de Paris, base de toParisDateKey.
// en-CA n'est qu'un choix de locale stable pour formatToParts (l'ordre
// des parts ne depend pas de la locale, on les lit par leur type).
const parisDayPartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "14:30" — l'heure de Paris d'un instant ISO UTC. */
export function formatTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

/** "jeudi 20 août 2026" — la date de Paris d'un instant ISO UTC. */
export function formatDateLong(iso: string): string {
  return dateLongFormatter.format(new Date(iso));
}

/** "20 août 2026" — version compacte pour les listes. */
export function formatDateShort(iso: string): string {
  return dateShortFormatter.format(new Date(iso));
}

/** "20 août 2026, 14:30" — date et heure sur une ligne. */
export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

/**
 * Cle "YYYY-MM-DD" du jour CALENDAIRE de Paris ou tombe un instant ISO
 * UTC. C'est elle qui regroupe les creneaux par jour : un creneau du
 * 21 aout a 00:30 heure de Paris (soit le 20 aout 22:30 UTC) obtient
 * bien la cle "2026-08-21".
 *
 * formatToParts (plutot que format()) : on assemble la cle nous-memes a
 * partir des composantes typees, sans dependre du separateur ni de
 * l'ordre qu'une locale choisirait.
 */
export function toParisDateKey(iso: string): string {
  const parts = parisDayPartsFormatter.formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Cle "YYYY-MM-DD" d'un objet Date de react-day-picker.
 *
 * Le calendrier manipule des Date construites a midi LOCAL pour chaque
 * case affichee : ses composantes getFullYear/getMonth/getDate SONT le
 * jour calendaire montre a l'utilisateur. On lit donc ces composantes
 * directement (surtout pas toISOString(), qui repasserait par UTC et
 * pourrait decaler d'un jour).
 */
export function localDayKey(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}
