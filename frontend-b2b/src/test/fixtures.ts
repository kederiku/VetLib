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
  AgendaEntryResponse,
  UserResponse,
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
