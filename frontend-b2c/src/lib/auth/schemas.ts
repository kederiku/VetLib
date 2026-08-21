/**
 * Schémas zod des formulaires du portail B2C (connexion, inscription
 * d'un propriétaire, fiche profil).
 *
 * Validation CÔTÉ CLIENT uniquement, pour le confort utilisateur (retour
 * immédiat sous le champ, sans aller-retour réseau). La vraie validation
 * de sécurité reste côté backend (Pydantic) : ces schémas en sont le
 * MIROIR, avec les mêmes bornes que RegisterOwnerRequest et
 * UpdateOwnerProfileRequest (prénom/nom 1-100, adresse tout-ou-rien).
 * Messages en français, car zod produit des messages anglais par défaut.
 *
 * La règle du mot de passe vit à part, dans password-policy.ts : elle est
 * partagée avec le portail des cliniques (une seule politique pour les deux
 * espaces de comptes) et mérite ses propres explications.
 */
import { z } from "zod";

import { passwordSchema } from "@/lib/auth/password-policy";

/**
 * Connexion : on valide le strict minimum.
 * Volontairement PAS la politique de mot de passe ici : la révéler sur
 * l'écran de login donnerait un indice à un attaquant et gênerait un
 * utilisateur dont l'ancien mot de passe serait plus court (la politique ne
 * s'applique qu'à la CREATION, côté backend aussi).
 * "Champ requis" suffit ; le backend tranche.
 */
export const loginSchema = z.object({
  email: z.email("Adresse email invalide."),
  password: z.string().min(1, "Le mot de passe est requis."),
});

/**
 * Étape 1 du parcours d'inscription : le compte lui-même.
 *
 * C'est la seule étape obligatoire du parcours : à sa validation le compte
 * existe et la session s'ouvre. Les étapes 2 (adresse) et 3 (animaux) sont
 * facultatives et se déroulent CONNECTE.
 *
 * .trim() retire les espaces accidentels en début/fin AVANT la mesure de
 * longueur (sinon "  a " passerait un min(1)) -- sauf sur le mot de passe,
 * où un espace est un caractère comme un autre.
 */
export const registerOwnerSchema = z
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
    email: z.email("Adresse email invalide."),
    // REQUIS ici, alors que le backend l'accepte nullable : c'est un choix du
    // parcours d'inscription (la clinique doit pouvoir joindre le
    // propriétaire), pas une contrainte du contrat d'API. La fiche /account
    // permet d'ailleurs de l'effacer ensuite, d'où le champ resté facultatif
    // dans profileSchema plus bas.
    phone: z
      .string()
      .trim()
      .min(1, "Le numéro de téléphone est requis.")
      .max(30, "Le numéro de téléphone ne peut pas dépasser 30 caractères."),
    password: passwordSchema,
    // Confirmation : purement locale, ce champ n'est JAMAIS envoyé au
    // backend. Il n'existe que pour attraper la faute de frappe tout de
    // suite, au lieu de la laisser découvrir à la prochaine connexion.
    password_confirmation: z.string(),
  })
  .refine((values) => values.password === values.password_confirmation, {
    // path : l'erreur se pose sous le champ de CONFIRMATION, pas sous le mot
    // de passe -- c'est la confirmation qu'on demande de corriger.
    path: ["password_confirmation"],
    message: "Les deux mots de passe ne correspondent pas.",
  });

// Code postal français : exactement 5 chiffres (le backend accepte
// jusqu'à 10 caractères pour l'international, mais le portail cible la
// France ; country reste d'ailleurs figé à "FR" dans le formulaire).
const FRENCH_POSTAL_CODE = /^\d{5}$/;

/**
 * Le bloc adresse, partagé par la fiche profil (/account) et par l'étape 2
 * du parcours d'inscription.
 *
 * Les champs sont des chaînes SIMPLES (jamais undefined) : un champ de
 * formulaire vide vaut "", ce qui simplifie le contrôle tout-ou-rien
 * ci-dessous et le pré-remplissage depuis l'API.
 */
const addressFields = z.object({
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
});

export type AddressFormValues = z.infer<typeof addressFields>;

/**
 * Le contrôle TOUT-OU-RIEN de l'adresse, extrait pour être appliqué aux deux
 * formulaires qui la portent.
 *
 * Côté backend, `address` est soit null, soit un AddressPayload COMPLET. Un
 * simple .optional() par champ ne suffirait pas : il accepterait "code postal
 * sans ville". D'où cette fonction : si l'un des trois champs essentiels
 * (ligne 1, code postal, ville) est rempli, les trois sont exigés, et le code
 * postal doit être un code français valide. Adresse entièrement vide = pas
 * d'erreur (le formulaire enverra address: null).
 *
 * @param prefix Chemin du bloc adresse dans le formulaire appelant : la fiche
 *   profil l'imbrique sous "address", l'étape 2 de l'inscription le porte à
 *   plat. Les erreurs doivent atterrir sous le bon champ dans les deux cas.
 */
function checkAddressAllOrNothing(
  address: AddressFormValues,
  ctx: z.RefinementCtx,
  prefix: readonly string[] = [],
): void {
  const { line1, line2, postal_code, city } = address;

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
      path: [...prefix, "line1"],
      message:
        "L'adresse (ligne 1) est requise si vous renseignez une adresse.",
    });
  }
  if (postal_code === "") {
    ctx.addIssue({
      code: "custom",
      path: [...prefix, "postal_code"],
      message: "Le code postal est requis si vous renseignez une adresse.",
    });
  } else if (!FRENCH_POSTAL_CODE.test(postal_code)) {
    ctx.addIssue({
      code: "custom",
      path: [...prefix, "postal_code"],
      message: "Le code postal doit contenir exactement 5 chiffres.",
    });
  }
  if (city === "") {
    ctx.addIssue({
      code: "custom",
      path: [...prefix, "city"],
      message: "La ville est requise si vous renseignez une adresse.",
    });
  }
}

/**
 * Étape 2 du parcours d'inscription : l'adresse seule, à plat.
 *
 * L'étape est entièrement PASSABLE : une adresse vide est valide et
 * n'entraîne aucun appel API. Si elle est entamée, la règle tout-ou-rien
 * s'applique exactement comme sur la fiche profil.
 */
export const onboardingAddressSchema = addressFields.superRefine(
  (values, ctx) => checkAddressAllOrNothing(values, ctx),
);

/**
 * Fiche profil du propriétaire (/account).
 *
 * Même bloc adresse que ci-dessus, mais imbriqué sous "address" et
 * accompagné des coordonnées et des préférences de rappel.
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
    // Facultatif ICI, contrairement à l'inscription : le numéro peut être
    // effacé après coup, et le backend l'accepte nullable.
    phone: z
      .string()
      .trim()
      .max(30, "Le numéro de téléphone ne peut pas dépasser 30 caractères.")
      .optional(),
    address: addressFields,
    notification_preferences: z.object({
      email: z.boolean(),
      sms: z.boolean(),
    }),
  })
  .superRefine((values, ctx) =>
    checkAddressAllOrNothing(values.address, ctx, ["address"]),
  );

// Types dérivés des schémas : la même déclaration sert la validation à
// l'exécution ET le typage des formulaires react-hook-form.
export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterOwnerFormValues = z.infer<typeof registerOwnerSchema>;
export type OnboardingAddressFormValues = z.infer<
  typeof onboardingAddressSchema
>;
export type ProfileFormValues = z.infer<typeof profileSchema>;
