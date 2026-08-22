/**
 * Libellés français des rôles du personnel de clinique.
 *
 * `Record<Role, string>` et non `Record<string, string>` : le type vient du
 * client généré, donc du contrat OpenAPI. Le jour où le backend ajoutera un
 * rôle, TypeScript refusera de compiler tant que son libellé manquera — une
 * erreur au build vaut mieux qu'un « undefined » affiché en production.
 */
import type { Role } from "@/lib/api/generated/vetoLibAPI.schemas";

export const ROLE_LABELS: Record<Role, string> = {
  asv: "ASV",
  veterinarian: "Vétérinaire",
  manager: "Gérant",
};

/** Options du sélecteur de rôle, dans l'ordre croissant de privilège. */
export const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "asv", label: ROLE_LABELS.asv },
  { value: "veterinarian", label: ROLE_LABELS.veterinarian },
  { value: "manager", label: ROLE_LABELS.manager },
];
