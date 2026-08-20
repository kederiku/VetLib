/**
 * Libellés français des rôles du personnel.
 *
 * Traduction des rôles techniques du backend vers les libellés métier,
 * partagée par la sidebar (identité compacte du pied) et le tableau de
 * bord. Record<Role, string> : TypeScript exige une entrée par rôle,
 * donc un nouveau rôle backend provoquera une erreur de compilation ici
 * (voulu : impossible d'oublier sa traduction).
 */
import type { Role } from "@/lib/api/generated/vetoLibAPI.schemas";

export const ROLE_LABELS: Record<Role, string> = {
  asv: "ASV",
  veterinarian: "Vétérinaire",
  manager: "Gérant",
};
