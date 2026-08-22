/**
 * Schémas zod des formulaires de clinique.
 *
 * Miroir des bornes du backend (`AdminCreateClinicRequest`,
 * `AdminUpdateClinicRequest`), pour un retour immédiat sous le champ. Le
 * backend reste l'autorité : ces schémas ne sont là que pour éviter un
 * aller-retour réseau sur une erreur évidente.
 *
 * La règle « adresse tout-ou-rien » est la partie délicate : le value object
 * `Address` du domaine exige `line1`, `postal_code` et `city` ENSEMBLE, ou
 * rien du tout. Un formulaire qui laisserait passer une adresse partielle
 * produirait un 422 illisible, avec le message sous un champ que
 * l'utilisateur n'a peut-être même pas touché.
 */
import { z } from "zod";

/** Champs d'adresse, tous optionnels individuellement. */
const adresseBrute = z.object({
  line1: z.string().trim().max(200).optional(),
  line2: z.string().trim().max(200).optional(),
  postal_code: z.string().trim().max(10).optional(),
  city: z.string().trim().max(100).optional(),
});

/**
 * Applique la règle tout-ou-rien à un bloc d'adresse.
 *
 * `superRefine` plutôt que `refine` : il permet de poser l'erreur SOUS LE
 * CHAMP manquant (`path`), au lieu d'un message global que l'utilisateur
 * devrait traduire lui-même en « lequel des quatre ? ».
 */
function verifierAdresse(
  valeur: z.infer<typeof adresseBrute>,
  ctx: z.RefinementCtx,
): void {
  const rempli = (champ?: string) => champ !== undefined && champ !== "";
  const obligatoires = [
    ["line1", valeur.line1] as const,
    ["postal_code", valeur.postal_code] as const,
    ["city", valeur.city] as const,
  ];
  const remplis = obligatoires.filter(([, champ]) => rempli(champ));
  // Aucun champ rempli : pas d'adresse, c'est valide.
  if (remplis.length === 0 && !rempli(valeur.line2)) return;

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
}

const adresse = adresseBrute.superRefine(verifierAdresse);

const identiteClinique = {
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
  timezone: z.string().trim().min(1, "Le fuseau horaire est requis."),
};

export const clinicCreateSchema = z.object({
  ...identiteClinique,
  email: z.email("Adresse email invalide."),
  address: adresse,
  // Bloc gérant OPTIONNEL : la case est décochée par défaut, on peut créer
  // la clinique seule et ajouter les gérants plus tard.
  avecGerant: z.boolean(),
  manager_email: z.string().trim().optional(),
  manager_first_name: z.string().trim().optional(),
  manager_last_name: z.string().trim().optional(),
}).superRefine((valeur, ctx) => {
  if (!valeur.avecGerant) return;
  // Les champs du gérant ne sont exigés QUE si la case est cochée : les
  // rendre obligatoires en permanence empêcherait de créer une clinique
  // seule, ce que le backend accepte pourtant.
  if (!z.email().safeParse(valeur.manager_email ?? "").success) {
    ctx.addIssue({
      code: "custom",
      path: ["manager_email"],
      message: "Adresse email du gérant invalide.",
    });
  }
  if ((valeur.manager_first_name ?? "") === "") {
    ctx.addIssue({
      code: "custom",
      path: ["manager_first_name"],
      message: "Le prénom du gérant est requis.",
    });
  }
  if ((valeur.manager_last_name ?? "") === "") {
    ctx.addIssue({
      code: "custom",
      path: ["manager_last_name"],
      message: "Le nom du gérant est requis.",
    });
  }
});

export const clinicEditSchema = z.object({
  ...identiteClinique,
  address: adresse,
});

export type ClinicCreateValues = z.infer<typeof clinicCreateSchema>;
export type ClinicEditValues = z.infer<typeof clinicEditSchema>;
