/**
 * Schémas zod des formulaires de planification (réglages + agenda).
 *
 * Comme pour l'auth : validation CÔTÉ CLIENT, pour le confort (retour
 * immédiat en français sous le champ) — la vraie validation reste côté
 * backend (Pydantic + règles du domaine). Chaque schéma est le MIROIR
 * du schéma de requête correspondant, avec les mêmes bornes.
 */
import { z } from "zod";

// Format HH:MM produit par les <input type="time"> natifs. La
// comparaison LEXICALE de deux chaînes à ce format équivaut à la
// comparaison chronologique ("09:00" < "18:30"), d'où son emploi direct
// dans le superRefine des horaires.
const TIME_HH_MM = /^\d{2}:\d{2}$/;

/**
 * Type de rendez-vous (créer/modifier). Miroir de
 * Create/UpdateAppointmentTypeRequest : nom 1-100, durée 5..480 par pas
 * de 5 (le backend refuse un 37 min ; le Select du dialog ne propose de
 * toute façon que des multiples de 5).
 */
export const appointmentTypeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Le nom est requis.")
    .max(100, "Le nom ne peut pas dépasser 100 caractères."),
  duration_minutes: z
    .number()
    .int("La durée doit être un nombre entier de minutes.")
    .min(5, "La durée minimale est de 5 minutes.")
    .max(480, "La durée maximale est de 480 minutes (8 heures).")
    .multipleOf(5, "La durée doit être un multiple de 5 minutes."),
  // Cycle de vie : on ne SUPPRIME jamais un type (les anciens rendez-vous
  // y font référence), on le désactive. Le Switch n'apparaît qu'en
  // édition ; à la création le champ reste true et n'est pas envoyé.
  active: z.boolean(),
});

/** Praticien (créer/modifier). Miroir de Create/UpdateResourceRequest. */
export const practitionerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Le nom est requis.")
    .max(200, "Le nom ne peut pas dépasser 200 caractères."),
  // Même logique que les types : la désactivation EST le cycle de vie.
  active: z.boolean(),
});

/**
 * Semaine type d'un praticien : tableau FIXE de 7 jours (index 0 =
 * lundi, la convention backend), chacun ouvert ou fermé avec une ou
 * PLUSIEURS plages horaires (matin + après-midi pour une pause
 * déjeuner, par exemple) — le miroir exact du modèle backend.
 *
 * Les jours FERMÉS gardent leurs plages en mémoire (rouvrir le mardi
 * retrouve "09:00-18:00") mais ne sont ni validés ni envoyés. Le
 * superRefine ne contrôle donc que les jours ouverts, et poste chaque
 * erreur sur `days.${i}.ranges.${j}.end` : elle s'affiche sous LA plage
 * fautive, pas en vrac sous le formulaire.
 */
export const weeklyScheduleSchema = z
  .object({
    days: z
      .array(
        z.object({
          open: z.boolean(),
          ranges: z
            .array(
              z.object({
                start: z.string(),
                end: z.string(),
              }),
            )
            .min(1, "Chaque jour doit garder au moins une plage."),
        }),
      )
      .length(7, "La semaine doit compter exactement 7 jours."),
  })
  .superRefine((values, ctx) => {
    values.days.forEach((day, i) => {
      if (!day.open) {
        return;
      }

      // 1) Validité de CHAQUE plage prise isolément.
      day.ranges.forEach((range, j) => {
        // Un <input type="time"> vidé vaut "" : plage sans horaire.
        if (!TIME_HH_MM.test(range.start) || !TIME_HH_MM.test(range.end)) {
          ctx.addIssue({
            code: "custom",
            path: ["days", i, "ranges", j, "end"],
            message: "Renseignez les heures d'ouverture et de fermeture.",
          });
          return;
        }
        // Comparaison lexicale HH:MM = comparaison chronologique.
        if (range.end <= range.start) {
          ctx.addIssue({
            code: "custom",
            path: ["days", i, "ranges", j, "end"],
            message: "L'heure de fermeture doit être après l'ouverture.",
          });
        }
      });

      // 2) NON-CHEVAUCHEMENT entre les plages du même jour (le backend
      // refuse aussi, autant l'expliquer avant l'envoi). On ne compare
      // que les plages déjà valides individuellement : inutile d'empiler
      // deux erreurs sur une plage incomplète.
      const valid = day.ranges
        .map((range, j) => ({ ...range, j }))
        .filter(
          (range) =>
            TIME_HH_MM.test(range.start) &&
            TIME_HH_MM.test(range.end) &&
            range.start < range.end,
        )
        // Tri chronologique (lexical HH:MM) : il suffit alors de
        // vérifier chaque plage contre la précédente.
        .sort((a, b) => (a.start < b.start ? -1 : 1));
      for (let k = 1; k < valid.length; k += 1) {
        if (valid[k].start < valid[k - 1].end) {
          ctx.addIssue({
            code: "custom",
            path: ["days", i, "ranges", valid[k].j, "end"],
            message: "Deux plages du même jour ne peuvent pas se chevaucher.",
          });
        }
      }
    });
  });

/**
 * Nouveau rendez-vous saisi par le staff (dialog de l'agenda).
 *
 * Le formulaire sépare date (Calendar) et heure (input time) ; le
 * composant les recombine en starts_at ISO à l'envoi. L'heure est LIBRE
 * (pas de liste de créneaux) : le staff peut forcer un horaire hors
 * grille, la contrainte d'exclusion PostgreSQL protège du chevauchement
 * (409 slot_already_booked affiché en bandeau).
 */
export const newAppointmentSchema = z.object({
  resource_id: z.string().min(1, "Choisissez un praticien."),
  appointment_type_id: z.string().min(1, "Choisissez un type de rendez-vous."),
  date: z.date("Choisissez une date."),
  time: z
    .string()
    .regex(TIME_HH_MM, "Indiquez une heure valide (HH:MM)."),
  // Écran réservé au client de PASSAGE (sans compte) : guest_name est
  // donc requis ici, alors qu'il est optionnel côté backend (qui accepte
  // aussi owner_id). La recherche d'un propriétaire existant viendra
  // avec le contexte patients.
  guest_name: z
    .string()
    .trim()
    .min(1, "Le nom du client est requis.")
    .max(200, "Le nom du client ne peut pas dépasser 200 caractères."),
  guest_pet_name: z
    .string()
    .trim()
    .max(100, "Le nom de l'animal ne peut pas dépasser 100 caractères.")
    .optional(),
  reason: z
    .string()
    .trim()
    .max(500, "Le motif ne peut pas dépasser 500 caractères.")
    .optional(),
});

/**
 * Absence/fermeture d'un praticien : une PÉRIODE de jours pleins choisie
 * dans un Calendar mode="range" (from = premier jour, to = dernier jour,
 * égaux pour une absence d'un seul jour) + une raison facultative.
 */
export const exceptionSchema = z.object({
  range: z.object(
    {
      from: z.date("Choisissez le premier jour de la période."),
      to: z.date("Choisissez le dernier jour de la période."),
    },
    "Choisissez une période dans le calendrier.",
  ),
  reason: z
    .string()
    .trim()
    .max(200, "La raison ne peut pas dépasser 200 caractères.")
    .optional(),
});

// Types dérivés : la même déclaration sert la validation à l'exécution
// ET le typage des formulaires react-hook-form.
export type AppointmentTypeFormValues = z.infer<typeof appointmentTypeSchema>;
export type PractitionerFormValues = z.infer<typeof practitionerSchema>;
export type WeeklyScheduleFormValues = z.infer<typeof weeklyScheduleSchema>;
export type NewAppointmentFormValues = z.infer<typeof newAppointmentSchema>;
export type ExceptionFormValues = z.infer<typeof exceptionSchema>;
