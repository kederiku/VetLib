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

import type { UserResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
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
 * Indique si CET utilisateur possède la permission demandée.
 *
 * Fonction PURE (pas un hook) : elle peut être appelée dans un .filter
 * ou un .map — par exemple pour filtrer les entrées de navigation —
 * là où la règle des hooks interdirait d'appeler useHasPermission en
 * boucle. `undefined` (session pas encore résolue) => false : "pas
 * encore de droits" est le défaut le plus sûr, l'UI n'affiche rien de
 * réservé par erreur.
 */
export function hasPermission(
  user: UserResponse | undefined,
  permission: Permission,
): boolean {
  return user?.permissions.includes(permission) ?? false;
}

/**
 * Variante hook : la permission de l'utilisateur CONNECTE.
 *
 * Simple sucre au-dessus de hasPermission pour les composants qui ne
 * manipulent qu'une permission ; sous l'AuthGuard, l'instant où la
 * session n'est pas résolue ne dure qu'une transition.
 */
export function useHasPermission(permission: Permission): boolean {
  const { data: user } = useCurrentUser();
  return hasPermission(user, permission);
}
