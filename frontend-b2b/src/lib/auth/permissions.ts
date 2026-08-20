/**
 * Permissions du portail B2B : MIROIR de la matrice backend.
 *
 * Le backend embarque les permissions dans le JWT ("fat token") et les
 * renvoie dans le UserResponse de /auth/me. Le frontend s'en sert
 * uniquement pour ADAPTER l'interface (cacher un onglet, un bouton) :
 * cacher un élément n'est PAS une protection, l'autorité reste le
 * backend (require_permission sur chaque endpoint). Cette liste doit
 * rester synchronisée avec ROLE_PERMISSIONS du backend
 * (identity/domain/value_objects.py) : une permission inconnue ici est
 * une faute de frappe détectée par TypeScript chez tous les appelants.
 */
"use client";

import { useCurrentUser } from "@/lib/auth/use-current-user";

// as const : fige le tableau en tuple de littéraux, ce qui permet de
// dériver le type union Permission ci-dessous (au lieu d'un simple
// string[] qui accepterait n'importe quelle chaîne).
export const PERMISSIONS = [
  "appointment:read",
  "appointment:write",
  "owner:read",
  "owner:write",
  "pet:read",
  "pet:write",
  "medical_record:read",
  "medical_record:write",
  "prescription:write",
  "clinic:manage",
  "staff:manage",
  "billing:read",
  "analytics:read",
] as const;

// Union littérale ("appointment:read" | "appointment:write" | ...) :
// le compilateur refuse useHasPermission("appointmnt:read") (typo).
export type Permission = (typeof PERMISSIONS)[number];

/**
 * Indique si l'utilisateur connecté possède la permission demandée.
 *
 * Retourne false tant que la session n'est pas résolue : sous
 * l'AuthGuard, ce cas ne dure qu'un instant de transition, et "pas
 * encore de droits" est le défaut le plus sûr (l'UI n'affiche rien de
 * réservé par erreur).
 */
export function useHasPermission(permission: Permission): boolean {
  const { data: user } = useCurrentUser();
  return user?.permissions.includes(permission) ?? false;
}
