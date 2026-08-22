/**
 * Schémas zod des formulaires du personnel.
 *
 * Miroir des bornes de `AdminCreateStaffRequest`. Il n'y a volontairement
 * PAS de champ mot de passe : le backend le génère et le renvoie une seule
 * fois (voir `components/staff/temporary-password-panel.tsx`). Laisser
 * l'exploitant en choisir un serait lui donner un accès en clair au compte
 * qu'il vient de créer.
 */
import { z } from "zod";

import { Role } from "@/lib/api/generated/vetoLibAPI.schemas";

export const staffCreateSchema = z.object({
  email: z.email("Adresse email invalide."),
  first_name: z
    .string()
    .trim()
    .min(1, "Le prénom est requis.")
    .max(100, "Le prénom ne peut pas dépasser 100 caractères."),
  last_name: z
    .string()
    .trim()
    .min(1, "Le nom est requis.")
    .max(100, "Le nom ne peut pas dépasser 100 caractères."),
  // z.enum sur les valeurs du contrat : un rôle inventé ne peut pas partir.
  role: z.enum(Role),
});

export type StaffCreateValues = z.infer<typeof staffCreateSchema>;
