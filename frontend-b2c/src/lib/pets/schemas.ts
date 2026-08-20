/**
 * Schema zod du formulaire animal (creation et renommage).
 *
 * Meme philosophie que les schemas d'auth (src/lib/auth/schemas.ts) :
 * validation cote client pour le confort (retour immediat sous le
 * champ), MIROIR des bornes Pydantic du backend (CreatePetRequest :
 * nom 1-100, espece parmi les quatre codes connus), messages en
 * francais.
 */
import { z } from "zod";

/**
 * Fiche animal : un nom et une espece.
 *
 * .trim() avant la mesure : "  " ne doit pas passer le min(1).
 * L'enum est ecrit en dur (et non derive de l'objet Species genere par
 * Orval) pour que z.infer produise exactement l'union 'dog'|'cat'|
 * 'nac'|'other' attendue par l'API ; le message d'erreur couvre le cas
 * du formulaire de creation ou aucune espece n'est encore cochee.
 */
export const petSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Le nom de l'animal est requis.")
    .max(100, "Le nom ne peut pas dépasser 100 caractères."),
  species: z.enum(["dog", "cat", "nac", "other"], {
    error: "Choisissez une espèce.",
  }),
});

// Type derive du schema : sert a typer le useForm du formulaire animal.
export type PetFormValues = z.infer<typeof petSchema>;
