/**
 * Fabriques d'objets de test communes au portail B2C.
 *
 * Les types générés par Orval décrivent des réponses d'API complètes : un
 * rendez-vous propriétaire compte douze champs. Écrire cet objet en entier
 * dans chaque test noierait la donnée qui compte vraiment (la date, le statut)
 * sous du remplissage. Ces fabriques posent des valeurs par défaut plausibles
 * et laissent chaque test ne préciser QUE ce qu'il teste.
 *
 * Rappel de fuseau : le backend renvoie des instants ISO en UTC, et
 * l'affichage se fait en heure de la clinique (Europe/Paris). En août, Paris
 * est à UTC+2 : "2026-08-20T07:00:00Z" s'affiche donc à 09h00.
 */
import type {
  AddressPayload,
  AvailabilitySlotResponse,
  OwnerAppointmentResponse,
  OwnerResponse,
  PetResponse,
  PublicAppointmentTypeResponse,
  PublicClinicResponse,
} from "@/lib/api/generated/vetoLibAPI.schemas";

/**
 * Rendez-vous du propriétaire, tel que le renvoie GET /owner/appointments.
 *
 * Statut "confirmed" et date FUTURE par défaut : c'est le cas le plus courant
 * à l'écran, et il rend `canCancel(rdv, maintenant)` vrai. Les tests
 * d'annulation n'ont donc qu'à surcharger ce qu'ils invalident.
 */
export function buildOwnerAppointment(
  overrides: Partial<OwnerAppointmentResponse> = {},
): OwnerAppointmentResponse {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    clinic_id: "00000000-0000-0000-0000-0000000000d1",
    clinic_name: "Clinique des Peupliers",
    appointment_type_name: "Consultation",
    resource_name: "Dr Martin",
    pet_id: "00000000-0000-0000-0000-0000000000e1",
    pet_name: "Rex",
    starts_at: "2026-08-20T07:00:00Z",
    ends_at: "2026-08-20T07:30:00Z",
    status: "confirmed",
    reason: null,
    cancelled_reason: null,
    ...overrides,
  };
}

/** Fiche animal (GET /owner/pets). */
export function buildPet(overrides: Partial<PetResponse> = {}): PetResponse {
  return {
    id: "00000000-0000-0000-0000-0000000000e1",
    name: "Rex",
    species: "dog",
    ...overrides,
  };
}

/** Entrée de l'annuaire public des cliniques (étape 1 du tunnel). */
export function buildPublicClinic(
  overrides: Partial<PublicClinicResponse> = {},
): PublicClinicResponse {
  return {
    id: "00000000-0000-0000-0000-0000000000d1",
    name: "Clinique des Peupliers",
    city: "Montpellier",
    ...overrides,
  };
}

/** Motif de consultation proposé par une clinique (étape 2 du tunnel). */
export function buildPublicAppointmentType(
  overrides: Partial<PublicAppointmentTypeResponse> = {},
): PublicAppointmentTypeResponse {
  return {
    id: "00000000-0000-0000-0000-0000000000b1",
    name: "Consultation",
    duration_minutes: 30,
    ...overrides,
  };
}

/** Créneau réservable (étape 4 du tunnel), en ISO UTC. */
export function buildAvailabilitySlot(
  overrides: Partial<AvailabilitySlotResponse> = {},
): AvailabilitySlotResponse {
  return {
    resource_id: "00000000-0000-0000-0000-0000000000a1",
    resource_name: "Dr Martin",
    starts_at: "2026-08-20T07:00:00Z",
    ends_at: "2026-08-20T07:30:00Z",
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
 * Propriétaire connecté (GET /owner/auth/me, PUT /owner/profile).
 *
 * `address: null` par défaut : c'est un état parfaitement valide au regard du
 * schéma (règle du tout-ou-rien), et le plus fréquent juste après
 * l'inscription.
 */
export function buildOwner(
  overrides: Partial<OwnerResponse> = {},
): OwnerResponse {
  return {
    id: "00000000-0000-0000-0000-0000000000f1",
    email: "marie.dupont@example.test",
    first_name: "Marie",
    last_name: "Dupont",
    phone: null,
    address: null,
    notification_preferences: { email: true, sms: false },
    ...overrides,
  };
}
