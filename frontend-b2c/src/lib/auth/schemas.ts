/**
 * Schémas zod des formulaires du portail B2C (connexion, inscription
 * d'un propriétaire, fiche profil).
 *
 * Validation CÔTÉ CLIENT uniquement, pour le confort utilisateur (retour
 * immédiat sous le champ, sans aller-retour réseau). La vraie validation
 * de sécurité reste côté backend (Pydantic) : ces schémas en sont le
 * MIROIR, avec les mêmes bornes que RegisterOwnerRequest et
 * UpdateOwnerProfileRequest (prénom/nom 1-100, mot de passe >= 12,
 * adresse tout-ou-rien). Messages en français, car zod produit des
 * messages anglais par défaut.
 */
import { z } from "zod";

/**
 * Connexion : on valide le strict minimum.
 * Volontairement PAS de min(12) sur le mot de passe ici : révéler la
 * politique de mot de passe sur l'écran de login donnerait un indice à
 * un attaquant et gênerait un utilisateur dont l'ancien mot de passe
 * serait plus court. "Champ requis" suffit ; le backend tranche.
 */
export const loginSchema = z.object({
  email: z.email("Adresse email invalide."),
  password: z.string().min(1, "Le mot de passe est requis."),
});

/**
 * Inscription d'un propriétaire : mêmes bornes que le backend.
 * .trim() retire les espaces accidentels en début/fin AVANT la mesure
 * de longueur (sinon "  a " passerait un min(1)).
 */
export const registerOwnerSchema = z.object({
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
  // Optionnel côté backend (nullable, max 30). optional() accepte un
  // champ absent ; le formulaire enverra null si la chaîne est vide.
  phone: z
    .string()
    .trim()
    .max(30, "Le numéro de téléphone ne peut pas dépasser 30 caractères.")
    .optional(),
  // Ici on AFFICHE la politique (min 12) : à l'inscription, l'utilisateur
  // doit savoir quoi taper. C'est l'inverse du login (voir plus haut).
  password: z
    .string()
    .min(12, "Le mot de passe doit contenir au moins 12 caractères."),
});

// Code postal français : exactement 5 chiffres (le backend accepte
// jusqu'à 10 caractères pour l'international, mais le portail cible la
// France ; country reste d'ailleurs figé à "FR" dans le formulaire).
const FRENCH_POSTAL_CODE = /^\d{5}$/;

/**
 * Fiche profil du propriétaire (/account).
 *
 * Particularité : le bloc adresse est TOUT-OU-RIEN, comme côté backend
 * (address est soit null, soit un AddressPayload complet). Un simple
 * .optional() par champ ne suffirait pas : il accepterait "code postal
 * sans ville". D'où le superRefine : si l'un des trois champs essentiels
 * (ligne 1, code postal, ville) est rempli, les trois sont exigés, et le
 * code postal doit être un code français valide. Adresse entièrement
 * vide = pas d'erreur (le formulaire enverra address: null).
 */
export const profileSchema = z
  .object({
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
    phone: z
      .string()
      .trim()
      .max(30, "Le numéro de téléphone ne peut pas dépasser 30 caractères.")
      .optional(),
    // Les champs adresse sont des chaînes SIMPLES (jamais undefined) :
    // un champ de formulaire vide vaut "", ce qui simplifie le
    // superRefine ci-dessous et le pré-remplissage depuis l'API.
    address: z.object({
      line1: z
        .string()
        .trim()
        .max(200, "L'adresse ne peut pas dépasser 200 caractères."),
      // Ligne 2 (bâtiment, étage...) : toujours facultative, même quand
      // le reste de l'adresse est rempli.
      line2: z
        .string()
        .trim()
        .max(200, "Le complément d'adresse ne peut pas dépasser 200 caractères."),
      postal_code: z.string().trim(),
      city: z
        .string()
        .trim()
        .max(100, "La ville ne peut pas dépasser 100 caractères."),
    }),
    notification_preferences: z.object({
      email: z.boolean(),
      sms: z.boolean(),
    }),
  })
  .superRefine((values, ctx) => {
    const { line1, line2, postal_code, city } = values.address;

    // Adresse absente = les QUATRE champs vides (y compris le complément) :
    // c'est un état valide, le propriétaire n'est pas obligé d'en donner
    // une. Inclure line2 dans ce test évite qu'un complément saisi seul
    // soit silencieusement jeté ("Profil enregistré" sans adresse) : il
    // déclenche à la place les erreurs "ligne 1 / code postal / ville
    // requis" sous les bons champs.
    if (line1 === "" && line2 === "" && postal_code === "" && city === "") {
      return;
    }

    // À partir d'ici, l'adresse est "engagée" : chaque champ essentiel
    // manquant ou invalide reçoit SA propre erreur, positionnée sous le
    // bon champ grâce au path (react-hook-form route errors.address.*).
    if (line1 === "") {
      ctx.addIssue({
        code: "custom",
        path: ["address", "line1"],
        message: "L'adresse (ligne 1) est requise si vous renseignez une adresse.",
      });
    }
    if (postal_code === "") {
      ctx.addIssue({
        code: "custom",
        path: ["address", "postal_code"],
        message: "Le code postal est requis si vous renseignez une adresse.",
      });
    } else if (!FRENCH_POSTAL_CODE.test(postal_code)) {
      ctx.addIssue({
        code: "custom",
        path: ["address", "postal_code"],
        message: "Le code postal doit contenir exactement 5 chiffres.",
      });
    }
    if (city === "") {
      ctx.addIssue({
        code: "custom",
        path: ["address", "city"],
        message: "La ville est requise si vous renseignez une adresse.",
      });
    }
  });

// Types dérivés des schémas : la même déclaration sert la validation à
// l'exécution ET le typage des formulaires react-hook-form.
export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterOwnerFormValues = z.infer<typeof registerOwnerSchema>;
export type ProfileFormValues = z.infer<typeof profileSchema>;
