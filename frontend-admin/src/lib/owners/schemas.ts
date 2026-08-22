/**
 * Schéma zod du formulaire d'édition d'un propriétaire.
 *
 * Miroir de `AdminUpdateOwnerRequest`. Ni email, ni mot de passe : l'email
 * est l'identifiant de connexion, et donner à un exploitant le moyen de
 * changer le mot de passe d'un client reviendrait à lui donner le moyen
 * d'entrer dans son compte.
 *
 * La règle « adresse tout-ou-rien » est la même que pour les cliniques ; le
 * bloc est dupliqué plutôt que partagé parce que les deux formulaires n'ont
 * en commun que quatre champs, et qu'un module « schémas d'adresse » pour
 * cela seul coûterait plus en indirection qu'il ne rapporte.
 */
import { z } from "zod";

const adresse = z
  .object({
    line1: z.string().trim().max(200).optional(),
    line2: z.string().trim().max(200).optional(),
    postal_code: z.string().trim().max(10).optional(),
    city: z.string().trim().max(100).optional(),
  })
  .superRefine((valeur, ctx) => {
    const rempli = (champ?: string) => champ !== undefined && champ !== "";
    const obligatoires = [
      ["line1", valeur.line1] as const,
      ["postal_code", valeur.postal_code] as const,
      ["city", valeur.city] as const,
    ];
    if (!obligatoires.some(([, champ]) => rempli(champ)) && !rempli(valeur.line2)) {
      return;
    }
    for (const [nom, champ] of obligatoires) {
      if (!rempli(champ)) {
        ctx.addIssue({
          code: "custom",
          path: [nom],
          message: "Ce champ est requis dès qu'une adresse est renseignée.",
        });
      }
    }
    if (rempli(valeur.postal_code) && !/^\d{5}$/.test(valeur.postal_code ?? "")) {
      ctx.addIssue({
        code: "custom",
        path: ["postal_code"],
        message: "Le code postal doit contenir exactement 5 chiffres.",
      });
    }
  });

export const ownerEditSchema = z.object({
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
  address: adresse,
});

export type OwnerEditValues = z.infer<typeof ownerEditSchema>;
