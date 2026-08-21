/**
 * PetFormDialog : le formulaire animal en boite de dialogue, pour CREER
 * ("Ajouter un animal") ou RENOMMER/reclasser un animal existant.
 *
 * Composant PILOTE par son parent ({ open, onOpenChange }) : c'est la
 * liste (ou le wizard de rendez-vous) qui decide quand l'ouvrir. Deux
 * mecanismes a connaitre :
 * 1. CONTENU MONTE CONDITIONNELLEMENT : le composant interne qui porte
 *    useForm n'est rendu QUE quand open est vrai. A la fermeture il est
 *    demonte, son etat react-hook-form disparait avec lui : la prochaine
 *    ouverture repart d'un formulaire propre (pas de reset() manuel a
 *    orchestrer, pas de valeurs fantomes de l'edition precedente) ;
 * 2. RADIO CONTROLEE : la RadioGroup Base UI n'expose pas de value
 *    lisible par register() ; l'espece passe par <Controller>
 *    (value / onValueChange), comme les Checkbox du profil.
 *
 * onSaved (optionnel) recoit la fiche creee/modifiee : le wizard de
 * prise de rendez-vous s'en sert pour selectionner automatiquement
 * l'animal tout juste ajoute.
 *
 * 3. REMPLACEMENT ET NON FUSION a l'edition : le backend expose un PUT,
 *    la fiche envoyee ecrase l'existante. C'est ce qui permet d'effacer
 *    une race saisie par erreur -- il suffit de vider le champ. Le
 *    formulaire porte donc TOUS les champs, jamais un sous-ensemble.
 */
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Controller, useForm } from "react-hook-form";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import type { ApiError } from "@/lib/api/errors";
import {
  getGetMyPetQueryKey,
  getListMyPetsQueryKey,
  useCreatePet,
  useUpdatePet,
} from "@/lib/api/generated/pets/pets";
import type { PetResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import { applyServerErrors } from "@/lib/auth/server-errors";
import { SEX_LABELS, SEX_ORDER } from "@/lib/pets/attributes";
import {
  PET_FORM_DEFAULTS,
  petSchema,
  sterilizedFromApi,
  sterilizedToApi,
  type PetFormValues,
} from "@/lib/pets/schemas";
import { SPECIES, SPECIES_ORDER } from "@/lib/pets/species";

// Champs que ce formulaire affiche : une erreur 422 sur un autre champ
// partirait dans le bandeau global (voir applyServerErrors).
const KNOWN_FIELDS = [
  "name",
  "species",
  "sex",
  "birth_date",
  "breed",
  "sterilized",
] as const;

interface PetFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent = creation ; present = edition de cette fiche. */
  pet?: PetResponse;
  /** Appele avec la fiche a jour apres un enregistrement reussi. */
  onSaved?: (pet: PetResponse) => void;
}

export function PetFormDialog({
  open,
  onOpenChange,
  pet,
  onSaved,
}: PetFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Montage conditionnel : voir la docstring du module. */}
      {open && (
        <PetFormDialogContent
          pet={pet}
          onSaved={onSaved}
          close={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

/**
 * Le contenu reel du dialogue (formulaire + mutations). Monte uniquement
 * dialogue ouvert, donc son useForm nait avec les bonnes defaultValues
 * (vides en creation, pre-remplies en edition) a chaque ouverture.
 */
function PetFormDialogContent({
  pet,
  onSaved,
  close,
}: {
  pet?: PetResponse;
  onSaved?: (pet: PetResponse) => void;
  close: () => void;
}) {
  const queryClient = useQueryClient();
  // TError = ApiError : le mutator jette toujours un ApiError normalise.
  const createMutation = useCreatePet<ApiError>();
  const updateMutation = useUpdatePet<ApiError>();

  const isEditing = pet !== undefined;

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PetFormValues>({
    resolver: zodResolver(petSchema),
    // defaultValues suffisent (pas de values:) : le contenu est remonte
    // a chaque ouverture, et la fiche pet ne change pas pendant que le
    // dialogue est ouvert.
    //
    // Les champs facultatifs sont des CHAINES vides et non undefined :
    // un <input> passerait sinon de non controle a controle des la
    // premiere frappe, ce que React signale.
    defaultValues:
      pet === undefined
        ? PET_FORM_DEFAULTS
        : {
            name: pet.name,
            species: pet.species,
            sex: pet.sex,
            birth_date: pet.birth_date ?? "",
            breed: pet.breed ?? "",
            sterilized: sterilizedFromApi(pet.sterilized),
          },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      // Corps commun a la creation et a l'edition : le backend expose un
      // POST complet et un PUT de REMPLACEMENT, tous deux attendent la
      // fiche entiere. Les chaines vides du formulaire deviennent null --
      // c'est ainsi qu'on EFFACE une race saisie par erreur.
      const data = {
        name: values.name,
        species: values.species,
        sex: values.sex,
        birth_date: values.birth_date === "" ? null : values.birth_date,
        breed: values.breed === "" ? null : values.breed,
        sterilized: sterilizedToApi(values.sterilized),
      };
      const res = isEditing
        ? await updateMutation.mutateAsync({ petId: pet.id, data })
        : await createMutation.mutateAsync({ data });

      // La liste des animaux est peut-etre affichee derriere le dialogue
      // (ou dans le tunnel de rendez-vous) : invalider par sa cle la
      // fait se rafraichir partout ou elle est montee.
      await queryClient.invalidateQueries({
        queryKey: getListMyPetsQueryKey(),
      });

      // Narrowing TypeScript : l'union generee inclut la variante 422,
      // mais le mutator jette sur tout statut >= 400 — a l'execution on
      // est forcement en 200/201 ici.
      if (res.status === 200 || res.status === 201) {
        // LA FICHE A SA PROPRE CLE DE CACHE. La page /animaux/[id] lit
        // getMyPet, pas listMyPets : sans cette ecriture, elle
        // continuerait d'afficher les valeurs d'AVANT l'edition jusqu'au
        // prochain rechargement -- alors qu'un toast vient d'annoncer
        // l'enregistrement. C'est le piege des deux queryKey pour une
        // meme entite.
        //
        // setQueryData et non invalidateQueries : la reponse EST la
        // fiche a jour, la re-demander au serveur serait une requete
        // pour rien.
        queryClient.setQueryData(getGetMyPetQueryKey(res.data.id), res);

        onSaved?.(res.data);
        toast.success(
          isEditing ? "Fiche enregistrée" : `${res.data.name} a été ajouté`,
        );
      }
      close();
    } catch (error) {
      applyServerErrors(error, setError, KNOWN_FIELDS);
    }
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {isEditing ? `Modifier ${pet.name}` : "Ajouter un animal"}
        </DialogTitle>
        <DialogDescription>
          {isEditing
            ? "Un champ laissé vide efface l'information correspondante."
            : "Seuls le nom et l'espèce sont nécessaires ; le reste peut attendre."}
        </DialogDescription>
      </DialogHeader>

      {/* noValidate : validation confiee a zod, pas aux bulles natives. */}
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          {errors.root?.server && (
            <Alert variant="destructive">
              <AlertTitle>{errors.root.server.message}</AlertTitle>
            </Alert>
          )}

          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="pet-name">Nom</FieldLabel>
            <Input
              id="pet-name"
              type="text"
              placeholder="Caramel"
              aria-invalid={!!errors.name}
              {...register("name")}
            />
            <FieldError errors={[errors.name]} />
          </Field>

          {/* FieldSet/FieldLegend : groupe semantique <fieldset>, les
              lecteurs d'ecran annoncent "Espece" avant chaque option. */}
          <FieldSet data-invalid={!!errors.species}>
            <FieldLegend>Espèce</FieldLegend>
            <Controller
              control={control}
              name="species"
              render={({ field }) => (
                // value ?? "" : RadioGroup controlee des le premier rendu
                // (passer undefined la ferait basculer en non controlee).
                <RadioGroup
                  value={field.value ?? ""}
                  onValueChange={(value) => field.onChange(value)}
                  className="grid-cols-2 gap-3"
                  aria-invalid={!!errors.species}
                >
                  {SPECIES_ORDER.map((species) => {
                    const { label, icon: Icon } = SPECIES[species];
                    return (
                      <Field key={species} orientation="horizontal">
                        <RadioGroupItem
                          value={species}
                          id={`pet-species-${species}`}
                        />
                        {/* htmlFor -> id de la radio : cliquer le libelle
                            (icone comprise) coche l'option. */}
                        <FieldLabel
                          htmlFor={`pet-species-${species}`}
                          className="font-normal"
                        >
                          <Icon
                            className="size-4 text-muted-foreground"
                            aria-hidden
                          />
                          {label}
                        </FieldLabel>
                      </Field>
                    );
                  })}
                </RadioGroup>
              )}
            />
            <FieldError errors={[errors.species]} />
          </FieldSet>

          <FieldSet data-invalid={!!errors.sex}>
            <FieldLegend>Sexe</FieldLegend>
            <Controller
              control={control}
              name="sex"
              render={({ field }) => (
                <RadioGroup
                  value={field.value ?? ""}
                  onValueChange={(value) => field.onChange(value)}
                  className="grid-cols-3 gap-3"
                  aria-invalid={!!errors.sex}
                >
                  {SEX_ORDER.map((sex) => (
                    <Field key={sex} orientation="horizontal">
                      <RadioGroupItem value={sex} id={`pet-sex-${sex}`} />
                      <FieldLabel
                        htmlFor={`pet-sex-${sex}`}
                        className="font-normal"
                      >
                        {SEX_LABELS[sex]}
                      </FieldLabel>
                    </Field>
                  ))}
                </RadioGroup>
              )}
            />
            <FieldError errors={[errors.sex]} />
          </FieldSet>

          <Field data-invalid={!!errors.birth_date}>
            <FieldLabel htmlFor="pet-birth-date">
              Date de naissance{" "}
              <span className="text-muted-foreground">(optionnel)</span>
            </FieldLabel>
            {/* type="date" : le navigateur fournit son selecteur natif et
                garantit le format "YYYY-MM-DD" attendu par le backend. */}
            <Input
              id="pet-birth-date"
              type="date"
              aria-invalid={!!errors.birth_date}
              {...register("birth_date")}
            />
            <FieldDescription>
              Même approximative, elle permet d&apos;afficher l&apos;âge de
              votre compagnon.
            </FieldDescription>
            <FieldError errors={[errors.birth_date]} />
          </Field>

          <Field data-invalid={!!errors.breed}>
            <FieldLabel htmlFor="pet-breed">
              Race <span className="text-muted-foreground">(optionnel)</span>
            </FieldLabel>
            <Input
              id="pet-breed"
              type="text"
              placeholder="Berger australien"
              aria-invalid={!!errors.breed}
              {...register("breed")}
            />
            <FieldError errors={[errors.breed]} />
          </Field>

          <FieldSet data-invalid={!!errors.sterilized}>
            <FieldLegend>Stérilisé</FieldLegend>
            <Controller
              control={control}
              name="sterilized"
              render={({ field }) => (
                <RadioGroup
                  value={field.value ?? ""}
                  onValueChange={(value) => field.onChange(value)}
                  className="grid-cols-3 gap-3"
                  aria-invalid={!!errors.sterilized}
                >
                  {/* Tri-etat assume : "je ne sais pas" est une reponse
                      legitime, et la forcer a "non" serait un mensonge
                      dans un dossier medical. */}
                  {(
                    [
                      ["yes", "Oui"],
                      ["no", "Non"],
                      ["", "Je ne sais pas"],
                    ] as const
                  ).map(([valeur, libelle]) => (
                    <Field key={libelle} orientation="horizontal">
                      <RadioGroupItem
                        value={valeur}
                        id={`pet-sterilized-${valeur === "" ? "unknown" : valeur}`}
                      />
                      <FieldLabel
                        htmlFor={`pet-sterilized-${valeur === "" ? "unknown" : valeur}`}
                        className="font-normal"
                      >
                        {libelle}
                      </FieldLabel>
                    </Field>
                  ))}
                </RadioGroup>
              )}
            />
            <FieldError errors={[errors.sterilized]} />
          </FieldSet>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Annuler
            </Button>
            {/* disabled pendant la soumission : pas de double envoi. */}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner data-icon="inline-start" />}
              {isEditing ? "Enregistrer" : "Ajouter"}
            </Button>
          </DialogFooter>
        </FieldGroup>
      </form>
    </DialogContent>
  );
}
