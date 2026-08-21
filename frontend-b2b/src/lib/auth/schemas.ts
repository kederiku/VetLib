/**
 * Schémas zod des formulaires d'authentification.
 *
 * Validation CÔTÉ CLIENT uniquement, pour le confort utilisateur (retour
 * immédiat sous le champ, sans aller-retour réseau). La vraie validation
 * de sécurité reste côté backend (Pydantic) : ces schémas en sont le
 * MIROIR, avec les mêmes bornes que RegisterClinicRequest (clinic_name
 * 2-200, prénom/nom 1-100). Messages en français, car zod produit des
 * messages anglais par défaut.
 *
 * La règle du mot de passe vit à part, dans password-policy.ts : elle est
 * partagée avec le portail propriétaires (une seule politique pour les deux
 * espaces de comptes) et mérite ses propres explications.
 */
import { z } from "zod";

import { passwordSchema } from "@/lib/auth/password-policy";

/**
 * Connexion : on valide le strict minimum.
 * Volontairement PAS la politique de mot de passe ici : la révéler sur
 * l'écran de login donnerait un indice à un attaquant et gênerait un
 * utilisateur dont l'ancien mot de passe serait plus court (la politique
 * ne s'applique qu'à la CREATION, côté backend aussi).
 * "Champ requis" suffit ; le backend tranche.
 */
export const loginSchema = z.object({
  email: z.email("Adresse email invalide."),
  password: z.string().min(1, "Le mot de passe est requis."),
});

/**
 * Inscription d'une clinique : mêmes bornes que le backend.
 * .trim() retire les espaces accidentels en début/fin AVANT la mesure
 * de longueur (sinon "  a " passerait un min(2)).
 */
export const registerClinicSchema = z.object({
  clinic_name: z
    .string()
    .trim()
    .min(2, "Le nom de la clinique doit contenir au moins 2 caractères.")
    .max(200, "Le nom de la clinique ne peut pas dépasser 200 caractères."),
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
  email: z.email("Adresse email invalide."),
  // Ici on APPLIQUE la politique : à l'inscription, l'utilisateur doit savoir
  // quoi taper. C'est l'inverse du login (voir plus haut).
  password: passwordSchema,
  // Optionnel côté backend (nullable, max 30). optional() accepte un
  // champ absent ; le formulaire enverra null si la chaîne est vide.
  phone: z
    .string()
    .trim()
    .max(30, "Le numéro de téléphone ne peut pas dépasser 30 caractères.")
    .optional(),
});

// Types dérivés des schémas : la même déclaration sert la validation à
// l'exécution ET le typage des formulaires react-hook-form.
export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterClinicFormValues = z.infer<typeof registerClinicSchema>;
