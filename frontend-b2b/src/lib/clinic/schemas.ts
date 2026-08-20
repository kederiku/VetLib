/**
 * Schéma zod de la fiche clinique (onglet "Ma clinique" des réglages).
 *
 * Miroir d'UpdateClinicProfileRequest : nom 2-200, téléphone optionnel,
 * adresse TOUT-OU-RIEN (soit null, soit complète — même mécanique que la
 * fiche propriétaire du portail B2C, dont ce bloc est le clone), et
 * timezone IANA non vide (l'arbitre final est le value object Timezone
 * du backend : un identifiant inconnu donne un 422).
 */
import { z } from "zod";

// Code postal français : exactement 5 chiffres (le pays est figé à "FR"
// dans le formulaire, comme côté B2C).
const FRENCH_POSTAL_CODE = /^\d{5}$/;

export const clinicSettingsSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Le nom de la clinique doit contenir au moins 2 caractères.")
      .max(200, "Le nom de la clinique ne peut pas dépasser 200 caractères."),
    phone: z
      .string()
      .trim()
      .max(30, "Le numéro de téléphone ne peut pas dépasser 30 caractères.")
      .optional(),
    // Champs adresse en chaînes SIMPLES (jamais undefined) : un champ de
    // formulaire vide vaut "", ce qui simplifie le superRefine ci-dessous
    // et le pré-remplissage depuis l'API.
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
    timezone: z.string().min(1, "Le fuseau horaire est requis."),
  })
  .superRefine((values, ctx) => {
    const { line1, line2, postal_code, city } = values.address;

    // Adresse absente = les QUATRE champs vides (complément inclus) :
    // état valide, le formulaire enverra address: null. Inclure line2
    // dans ce test évite qu'un complément saisi seul soit silencieusement
    // jeté : il déclenche à la place les erreurs "requis" ci-dessous.
    if (line1 === "" && line2 === "" && postal_code === "" && city === "") {
      return;
    }

    // Adresse "engagée" : chaque champ essentiel manquant ou invalide
    // reçoit SA propre erreur, positionnée sous le bon champ via path.
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

export type ClinicSettingsFormValues = z.infer<typeof clinicSettingsSchema>;
