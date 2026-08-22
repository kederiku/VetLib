/**
 * Fabriques d'objets de test du back-office plateforme.
 *
 * Les types générés par Orval décrivent des réponses d'API complètes. Écrire
 * l'objet en entier dans chaque test noierait la donnée qui compte sous du
 * remplissage. Ces fabriques posent des valeurs par défaut plausibles et
 * laissent chaque test ne préciser QUE ce qu'il vérifie.
 */
import { vi } from "vitest";

import type {
  AdminClinicSummary,
  AdminOwnerSummary,
  AdminResponse,
  AdminStaffSummary,
} from "@/lib/api/generated/vetoLibAPI.schemas";
import type { TableUrlState } from "@/lib/table/use-table-url-state";

/** Administrateur de plateforme de test. */
export function buildAdmin(overrides: Partial<AdminResponse> = {}): AdminResponse {
  return {
    id: "00000000-0000-0000-0000-0000000000a1",
    email: "fondateur@vetolib.fr",
    first_name: "Cédric",
    last_name: "Delagrée",
    ...overrides,
  };
}

/** Ligne de la liste des cliniques. */
export function buildClinicSummary(
  overrides: Partial<AdminClinicSummary> = {},
): AdminClinicSummary {
  return {
    id: "00000000-0000-0000-0000-0000000000c1",
    name: "Clinique des Lilas",
    email: "contact@lilas.fr",
    phone: "0102030405",
    city: "Paris",
    is_active: true,
    staff_count: 4,
    created_at: "2026-05-12T09:30:00Z",
    ...overrides,
  };
}

/** Ligne de la liste des proprietaires. */
export function buildOwnerSummary(
  overrides: Partial<AdminOwnerSummary> = {},
): AdminOwnerSummary {
  return {
    id: "00000000-0000-0000-0000-0000000000d1",
    email: "claire.martin@exemple.fr",
    first_name: "Claire",
    last_name: "Martin",
    phone: "0605040302",
    city: "Lyon",
    is_active: true,
    pet_count: 2,
    created_at: "2026-06-01T14:00:00Z",
    ...overrides,
  };
}

/** Ligne de la liste du personnel. */
export function buildStaffSummary(
  overrides: Partial<AdminStaffSummary> = {},
): AdminStaffSummary {
  return {
    id: "00000000-0000-0000-0000-0000000000e1",
    clinic_id: "00000000-0000-0000-0000-0000000000c1",
    clinic_name: "Clinique des Lilas",
    clinic_is_active: true,
    email: "claire.martin@lilas.fr",
    first_name: "Claire",
    last_name: "Martin",
    role: "manager",
    is_active: true,
    created_at: "2026-05-12T09:30:00Z",
    ...overrides,
  };
}

/**
 * Etat d'URL simule d'une datatable.
 *
 * Les mutateurs sont des espions : les tests de composants verifient QUE la
 * table demande le bon changement, sans avoir a monter un routeur Next.
 */
export function buildTableUrlState(
  overrides: Partial<TableUrlState> = {},
): TableUrlState {
  return {
    page: 1,
    taille: 20,
    q: "",
    tri: "created_at",
    sens: "desc",
    offset: 0,
    changerPage: vi.fn(),
    changerTaille: vi.fn(),
    changerRecherche: vi.fn(),
    changerTri: vi.fn(),
    lireFiltre: (_nom, _autorises, defaut) => defaut,
    changerFiltre: vi.fn(),
    ...overrides,
  };
}
