/**
 * Fabriques d'objets de test du back-office plateforme.
 *
 * Les types générés par Orval décrivent des réponses d'API complètes. Écrire
 * l'objet en entier dans chaque test noierait la donnée qui compte sous du
 * remplissage. Ces fabriques posent des valeurs par défaut plausibles et
 * laissent chaque test ne préciser QUE ce qu'il vérifie.
 */
import type { AdminResponse } from "@/lib/api/generated/vetoLibAPI.schemas";

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
