/**
 * Fabriques d'objets de test communes au portail B2B.
 *
 * Les types générés par Orval décrivent des réponses d'API complètes : une
 * entrée d'agenda compte dix-huit champs. Écrire cet objet en entier dans
 * chaque test noierait la donnée qui compte vraiment (les horaires) sous du
 * remplissage. Ces fabriques posent des valeurs par défaut plausibles et
 * laissent chaque test ne préciser QUE ce qu'il teste.
 */
import type {
  AddressPayload,
  AgendaEntryResponse,
  AppointmentTypeResponse,
  ClinicProfileResponse,
  ResourceResponse,
  ScheduleExceptionResponse,
  UserResponse,
  WeeklyScheduleResponse,
} from "@/lib/api/generated/vetoLibAPI.schemas";

/**
 * Entrée d'agenda de test.
 *
 * Rappel de fuseau : le backend renvoie des instants ISO en UTC, et
 * l'affichage se fait en heure de la clinique (Europe/Paris). En août,
 * Paris est à UTC+2 : "2026-08-20T07:00:00Z" s'affiche donc à 09h00.
 */
export function buildAgendaEntry(
  overrides: Partial<AgendaEntryResponse> = {},
): AgendaEntryResponse {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    resource_id: "00000000-0000-0000-0000-0000000000a1",
    resource_name: "Dr Martin",
    appointment_type_id: "00000000-0000-0000-0000-0000000000b1",
    appointment_type_name: "Consultation",
    starts_at: "2026-08-20T07:00:00Z",
    ends_at: "2026-08-20T07:30:00Z",
    status: "confirmed",
    reason: null,
    cancelled_reason: null,
    owner_id: null,
    owner_first_name: null,
    owner_last_name: null,
    owner_phone: null,
    pet_name: null,
    pet_species: null,
    guest_name: null,
    guest_pet_name: null,
    ...overrides,
  };
}

/** Utilisateur du personnel de test, sans aucune permission par défaut. */
export function buildUser(overrides: Partial<UserResponse> = {}): UserResponse {
  return {
    id: "00000000-0000-0000-0000-0000000000c1",
    clinic_id: "00000000-0000-0000-0000-0000000000d1",
    clinic_name: "Clinique des Peupliers",
    email: "asv@clinique.test",
    first_name: "Camille",
    last_name: "Durand",
    role: "asv",
    permissions: [],
    ...overrides,
  };
}

/**
 * Praticien réservable.
 *
 * `kind` est figé à "veterinarian" : l'énumération existe pour accueillir un
 * jour des salles et des équipements, mais seuls les vétérinaires sont
 * réservables en phase actuelle.
 */
export function buildResource(
  overrides: Partial<ResourceResponse> = {},
): ResourceResponse {
  return {
    id: "00000000-0000-0000-0000-0000000000a1",
    kind: "veterinarian",
    name: "Dr Martin",
    user_id: null,
    active: true,
    ...overrides,
  };
}

/**
 * Type de rendez-vous proposé à la réservation.
 *
 * Durée multiple de 5 : le schéma de validation refuse tout le reste, comme
 * le backend, parce que la grille de l'agenda est découpée en tranches de
 * cinq minutes.
 */
export function buildAppointmentType(
  overrides: Partial<AppointmentTypeResponse> = {},
): AppointmentTypeResponse {
  return {
    id: "00000000-0000-0000-0000-0000000000b1",
    name: "Consultation",
    duration_minutes: 30,
    active: true,
    ...overrides,
  };
}

/** Adresse postale complète. Le backend n'accepte que "tout ou rien". */
export function buildAddress(
  overrides: Partial<AddressPayload> = {},
): AddressPayload {
  return {
    line1: "12 rue des Lilas",
    line2: null,
    postal_code: "34000",
    city: "Montpellier",
    country: "FR",
    ...overrides,
  };
}

/**
 * Fiche de la clinique connectée.
 *
 * `timezone` : c'est la clinique qui fait foi pour tout affichage horaire,
 * jamais le fuseau du navigateur.
 */
export function buildClinicProfile(
  overrides: Partial<ClinicProfileResponse> = {},
): ClinicProfileResponse {
  return {
    id: "00000000-0000-0000-0000-0000000000d1",
    name: "Clinique des Peupliers",
    email: "contact@peupliers.test",
    phone: null,
    address: null,
    timezone: "Europe/Paris",
    ...overrides,
  };
}

/** Une plage de la semaine type. weekday 0 = lundi (convention backend). */
export function buildWeeklySchedule(
  overrides: Partial<WeeklyScheduleResponse> = {},
): WeeklyScheduleResponse {
  return { weekday: 0, start_time: "09:00", end_time: "18:00", ...overrides };
}

/** Absence ou fermeture d'un praticien, en jours pleins ISO UTC. */
export function buildScheduleException(
  overrides: Partial<ScheduleExceptionResponse> = {},
): ScheduleExceptionResponse {
  return {
    id: "00000000-0000-0000-0000-0000000000c9",
    resource_id: "00000000-0000-0000-0000-0000000000a1",
    starts_at: "2026-08-24T00:00:00Z",
    ends_at: "2026-08-25T00:00:00Z",
    reason: null,
    ...overrides,
  };
}
