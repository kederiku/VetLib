/**
 * Schémas zod des formulaires du back-office.
 *
 * Validation CÔTÉ CLIENT uniquement, pour le confort : retour immédiat sous
 * le champ, sans aller-retour réseau. La validation de sécurité reste côté
 * backend (Pydantic) ; ces schémas en sont le MIROIR. Messages en français,
 * zod produisant des messages anglais par défaut.
 */
import { z } from "zod";

/**
 * Connexion : on valide le strict minimum.
 *
 * Volontairement PAS la politique de mot de passe. La révéler sur un écran
 * de connexion donnerait un indice à un attaquant, et gênerait un compte dont
 * le mot de passe serait plus ancien que la politique — qui ne s'applique
 * qu'à la CRÉATION, côté backend aussi. « Champ requis » suffit, le serveur
 * tranche.
 */
export const loginSchema = z.object({
  email: z.email("Adresse email invalide."),
  password: z.string().min(1, "Le mot de passe est requis."),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
