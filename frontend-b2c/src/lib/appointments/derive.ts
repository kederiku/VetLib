/**
 * Dérivations pures sur la liste des rendez-vous du propriétaire.
 *
 * POURQUOI CE MODULE : GET /owner/appointments renvoie TOUS les
 * rendez-vous, toutes cliniques confondues, avec les noms déjà
 * dénormalisés par le backend (clinique, motif, praticien, animal).
 * Toutes les vues du portail — le prochain rendez-vous du tableau de
 * bord, les onglets à venir / passés, l'historique d'un animal, la fiche
 * d'un rendez-vous — sont donc des DÉRIVATIONS de cette unique liste,
 * pas des requêtes supplémentaires. Une seule queryKey TanStack, un seul
 * cache, une seule invalidation : annuler un rendez-vous rafraîchit tous
 * les écrans d'un coup.
 *
 * Les fonctions sont pures et reçoivent « maintenant » en paramètre
 * (jamais de new Date() caché) : elles sont donc testables sans
 * simuler l'horloge, et deux appels au sein d'un même rendu partagent
 * exactement la même frontière futur / passé.
 *
 * Le tri et le partage se font sur starts_at, PAS sur le statut : un
 * rendez-vous futur annulé reste dans « à venir » avec son badge -- le
 * propriétaire doit voir que son créneau de jeudi est tombé.
 */
import type { OwnerAppointmentResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import { toParisDateKey } from "@/lib/date/format";

/** Millisecondes de l'instant de début, raccourci de lecture. */
function debut(appt: OwnerAppointmentResponse): number {
  return new Date(appt.starts_at).getTime();
}

/**
 * Partage la liste en « à venir » (tri chronologique ascendant, le
 * prochain d'abord) et « passés » (descendant, le plus récent d'abord).
 *
 * Les deux tris sont volontairement opposés : dans le futur on lit vers
 * l'avant (« qu'est-ce qui m'attend ? »), dans le passé on lit vers
 * l'arrière (« quand suis-je venu la dernière fois ? »).
 */
export function splitByTime(
  appointments: readonly OwnerAppointmentResponse[],
  now: Date,
): { upcoming: OwnerAppointmentResponse[]; past: OwnerAppointmentResponse[] } {
  const nowMs = now.getTime();
  const upcoming = appointments
    .filter((appt) => debut(appt) > nowMs)
    .sort((a, b) => debut(a) - debut(b));
  const past = appointments
    .filter((appt) => debut(appt) <= nowMs)
    .sort((a, b) => debut(b) - debut(a));
  return { upcoming, past };
}

/**
 * Le prochain rendez-vous, ou null s'il n'y en a aucun à venir.
 * C'est le bloc principal du tableau de bord.
 */
export function nextAppointment(
  appointments: readonly OwnerAppointmentResponse[],
  now: Date,
): OwnerAppointmentResponse | null {
  return splitByTime(appointments, now).upcoming[0] ?? null;
}

/** Les rendez-vous d'UN animal, dans l'ordre d'arrivée de la liste. */
export function forPet(
  appointments: readonly OwnerAppointmentResponse[],
  petId: string,
): OwnerAppointmentResponse[] {
  return appointments.filter((appt) => appt.pet_id === petId);
}

/**
 * La dernière visite d'un animal (rendez-vous passé le plus récent), ou
 * null. Sert de sous-ligne aux fiches animaux : « Dernière visite : 12
 * mars 2026 » répond à une vraie question, là où un compteur de
 * rendez-vous n'en répond à aucune.
 */
export function lastVisit(
  appointments: readonly OwnerAppointmentResponse[],
  petId: string,
  now: Date,
): OwnerAppointmentResponse | null {
  return splitByTime(forPet(appointments, petId), now).past[0] ?? null;
}

/** Le prochain rendez-vous d'UN animal, ou null. */
export function nextForPet(
  appointments: readonly OwnerAppointmentResponse[],
  petId: string,
  now: Date,
): OwnerAppointmentResponse | null {
  return nextAppointment(forPet(appointments, petId), now);
}

/** Critères de filtrage de la page « Mes rendez-vous ». */
export type AppointmentFilters = {
  /** Identifiant d'animal, "sans-animal" pour les fiches non rattachées, ou null. */
  petId?: string | null;
  clinicId?: string | null;
};

/**
 * Valeur sentinelle du filtre « animal » pour les rendez-vous créés par
 * la clinique sans fiche patient rattachée (pet_id null). Un UUID ne
 * pourrait pas exprimer « aucun », et null signifie déjà « tous ».
 */
export const SANS_ANIMAL = "sans-animal";

/** Applique les filtres actifs ; un critère absent ou null ne filtre rien. */
export function filterAppointments(
  appointments: readonly OwnerAppointmentResponse[],
  { petId = null, clinicId = null }: AppointmentFilters = {},
): OwnerAppointmentResponse[] {
  return appointments.filter((appt) => {
    if (petId !== null) {
      const correspond =
        petId === SANS_ANIMAL ? appt.pet_id === null : appt.pet_id === petId;
      if (!correspond) return false;
    }
    if (clinicId !== null && appt.clinic_id !== clinicId) return false;
    return true;
  });
}

/**
 * Les cliniques distinctes présentes dans la liste, triées par nom.
 *
 * Dérivées des rendez-vous eux-mêmes (clinic_name est dénormalisé) :
 * aucune requête à l'annuaire n'est nécessaire pour peupler le filtre.
 */
export function distinctClinics(
  appointments: readonly OwnerAppointmentResponse[],
): { id: string; name: string }[] {
  const parNom = new Map<string, string>();
  for (const appt of appointments) {
    parNom.set(appt.clinic_id, appt.clinic_name);
  }
  return [...parNom.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/** Un groupe de l'historique : un mois calendaire et ses rendez-vous. */
export type MonthGroup = {
  /** Clé stable "YYYY-MM", utilisable comme key React. */
  key: string;
  appointments: OwnerAppointmentResponse[];
};

/**
 * Regroupe des rendez-vous par mois calendaire de Paris, en CONSERVANT
 * l'ordre de la liste reçue (déjà triée par l'appelant).
 *
 * Le mois se lit sur la clé de jour de Paris et jamais sur les
 * composantes locales d'une Date : un rendez-vous du 1er septembre à
 * 00h30 heure de Paris tombe le 31 août en UTC, et atterrirait dans le
 * mauvais groupe.
 */
export function groupByMonth(
  appointments: readonly OwnerAppointmentResponse[],
): MonthGroup[] {
  const groupes: MonthGroup[] = [];
  for (const appt of appointments) {
    const key = toParisDateKey(appt.starts_at).slice(0, 7);
    const dernier = groupes.at(-1);
    if (dernier !== undefined && dernier.key === key) {
      dernier.appointments.push(appt);
    } else {
      groupes.push({ key, appointments: [appt] });
    }
  }
  return groupes;
}
