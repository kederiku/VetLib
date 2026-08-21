/**
 * Schema zod du formulaire animal (creation et edition).
 *
 * Meme philosophie que les schemas d'auth (src/lib/auth/schemas.ts) :
 * validation cote client pour le confort (retour immediat sous le
 * champ), MIROIR des bornes Pydantic et des regles du domaine backend,
 * messages en francais.
 *
 * Les champs facultatifs sont des CHAINES SIMPLES (jamais undefined) :
 * un champ de formulaire vide vaut "", ce qui evite les gardes
 * `?? ""` a chaque pre-remplissage. La traduction "" -> null pour
 * l'API se fait a l'envoi, dans le formulaire.
 */
import { z } from "zod";

/** Bornes miroir du domaine backend (patients/domain/pet.py). */
const BREED_MAX = 100;
const MIN_BIRTH_YEAR = 1900;

// "YYYY-MM-DD" strict : c'est ce que produit un <input type="date"> et
// ce qu'attend le backend.
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Le NOYAU d'une fiche animal : ce qu'il faut au minimum pour declarer
 * un compagnon.
 *
 * Extrait de la fiche complete parce que l'etape 3 de l'inscription ne
 * demande QUE cela : y imposer sexe, race et date de naissance
 * alourdirait un parcours volontairement expedie -- tout se complete
 * ensuite depuis la fiche de l'animal.
 */
export const petCoreSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Le nom de l'animal est requis.")
    .max(100, "Le nom ne peut pas dépasser 100 caractères."),
  // L'enum est ecrit en dur (et non derive de l'objet Species genere par
  // Orval) pour que z.infer produise exactement l'union attendue par
  // l'API ; le message couvre le cas du formulaire de creation ou aucune
  // espece n'est encore cochee.
  species: z.enum(["dog", "cat", "nac", "other"], {
    error: "Choisissez une espèce.",
  }),
});

export type PetCoreFormValues = z.infer<typeof petCoreSchema>;

/**
 * Fiche animal complete.
 *
 * La date de naissance est validee ICI comme cote domaine : ni dans le
 * futur, ni avant 1900. Ce n'est pas une regle biologique mais un
 * garde-fou de faute de frappe -- "2202" est attrape par la borne haute,
 * "0202" par la borne basse. Le retour immediat sous le champ evite un
 * aller-retour reseau pour une coquille.
 */
export const petSchema = petCoreSchema.extend({
  sex: z.enum(["male", "female", "unknown"], {
    error: "Choisissez une réponse.",
  }),
  birth_date: z
    .string()
    .trim()
    .refine((valeur) => valeur === "" || DATE_ISO.test(valeur), {
      error: "Date invalide.",
    })
    .refine(
      (valeur) => {
        if (valeur === "") return true;
        const annee = Number(valeur.slice(0, 4));
        return annee >= MIN_BIRTH_YEAR;
      },
      { error: `L'année doit être postérieure à ${MIN_BIRTH_YEAR}.` },
    )
    .refine(
      (valeur) => {
        if (valeur === "") return true;
        // Comparaison de CHAINES "YYYY-MM-DD" : l'ordre lexicographique
        // est l'ordre chronologique, aucun objet Date n'est construit,
        // donc aucun piege de fuseau.
        const aujourdhui = new Date().toISOString().slice(0, 10);
        return valeur <= aujourdhui;
      },
      { error: "La date de naissance ne peut pas être dans le futur." },
    ),
  breed: z
    .string()
    .trim()
    .max(BREED_MAX, `La race ne peut pas dépasser ${BREED_MAX} caractères.`),
  // Tri-etat porte par une chaine : les boutons radio d'un formulaire ne
  // savent pas transporter null. "" = non renseigne.
  sterilized: z.enum(["yes", "no", ""]),
});

// Type derive du schema : sert a typer le useForm du formulaire animal.
export type PetFormValues = z.infer<typeof petSchema>;

/** Valeurs d'un formulaire vierge (creation). */
export const PET_FORM_DEFAULTS: PetFormValues = {
  name: "",
  species: "dog",
  sex: "unknown",
  birth_date: "",
  breed: "",
  sterilized: "",
};

/** Traduit le tri-etat du formulaire vers le booleen nullable de l'API. */
export function sterilizedToApi(
  valeur: PetFormValues["sterilized"],
): boolean | null {
  if (valeur === "") return null;
  return valeur === "yes";
}

/** Traduit le booleen nullable de l'API vers le tri-etat du formulaire. */
export function sterilizedFromApi(
  valeur: boolean | null,
): PetFormValues["sterilized"] {
  if (valeur === null) return "";
  return valeur ? "yes" : "no";
}
