/**
 * Étape 3 du parcours d'inscription : les animaux du propriétaire.
 *
 * Entièrement FACULTATIVE, comme l'étape 2 : « Je le ferai plus tard »
 * n'envoie aucune requête, et la page /animaux propose de toute façon un état
 * vide engageant pour rattraper plus tard.
 *
 * Plusieurs animaux se saisissent d'un coup (useFieldArray) puis partent en
 * autant d'appels POST /owner/pets — il n'existe pas d'endpoint de création en
 * lot, et en créer un ferait écrire le contexte patients depuis un flux
 * d'inscription qui appartient à identity.
 *
 * D'où le vrai sujet de ce composant : L'ÉCHEC PARTIEL. Trois animaux saisis,
 * le deuxième échoue -> le premier EXISTE déjà en base. Réessayer bêtement le
 * créerait en double. Les lignes déjà enregistrées sont donc retirées du
 * formulaire, et le compteur affiché dit ce qui est acquis. Un nouvel essai ne
 * porte que sur ce qui reste.
 */
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { PawPrint, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
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
  getListMyPetsQueryKey,
  useCreatePet,
} from "@/lib/api/generated/pets/pets";
import { applyServerErrors } from "@/lib/auth/server-errors";
import { petCoreSchema } from "@/lib/pets/schemas";
import { SPECIES, SPECIES_ORDER } from "@/lib/pets/species";

/**
 * Une liste de fiches animal, chacune validée par le MÊME schéma que le
 * formulaire de la page /animaux : une seule définition de ce qu'est une
 * fiche valide.
 */
const stepPetsSchema = z.object({ pets: z.array(petCoreSchema) });
type StepPetsFormValues = z.infer<typeof stepPetsSchema>;

// Aucun champ "plat" à reconnaître : les erreurs 422 porteraient sur
// name/species d'UNE ligne, que le backend localise sans savoir de quelle
// ligne il s'agit. Tout part donc dans le bandeau global.
const KNOWN_FIELDS = [] as const;

/** Une ligne vierge : le formulaire en propose une d'emblée. */
const EMPTY_PET = {
  name: "",
  species: undefined,
} as unknown as StepPetsFormValues["pets"][number];

interface StepPetsProps {
  /** Fin du parcours ; reçoit le nombre d'animaux réellement enregistrés. */
  onDone: (createdCount: number) => void;
}

export function StepPets({ onDone }: StepPetsProps) {
  const queryClient = useQueryClient();
  const createMutation = useCreatePet<ApiError>();

  // Animaux DEJA enregistres lors d'un essai precedent qui a echoue en cours
  // de route. Sert a la fois au message ("2 deja enregistres") et au compte
  // final remonte au wizard.
  const [savedCount, setSavedCount] = useState(0);

  const {
    register,
    control,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<StepPetsFormValues>({
    resolver: zodResolver(stepPetsSchema),
    defaultValues: { pets: [EMPTY_PET] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "pets" });

  const onSubmit = handleSubmit(async (values) => {
    // Les erreurs "root" ne sont pas effacées par la validation : on repart
    // d'un bandeau propre à chaque tentative.
    clearErrors("root");

    // Séquentiel et non Promise.all : en cas d'échec on doit savoir COMBIEN
    // de lignes sont passées, donc dans quel état on laisse le compte. Un
    // Promise.all rendrait des résultats mêlés, impossibles à recoller aux
    // lignes du formulaire.
    let created = 0;
    try {
      for (const pet of values.pets) {
        await createMutation.mutateAsync({
          data: { name: pet.name, species: pet.species },
        });
        created += 1;
      }
    } catch (error) {
      // Les `created` premières lignes EXISTENT en base : les retirer du
      // formulaire est ce qui empêche un doublon au prochain essai.
      if (created > 0) {
        remove(Array.from({ length: created }, (_, index) => index));
        setSavedCount((total) => total + created);
        await queryClient.invalidateQueries({
          queryKey: getListMyPetsQueryKey(),
        });
      }
      applyServerErrors(error, setError, KNOWN_FIELDS);
      return;
    }

    // La liste des animaux est peut-être déjà montée ailleurs (page
    // /animaux, wizard de rendez-vous) : invalider par sa clé la fait se
    // rafraîchir partout.
    await queryClient.invalidateQueries({ queryKey: getListMyPetsQueryKey() });
    onDone(savedCount + created);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vos animaux</CardTitle>
        <CardDescription>
          Facultatif. Déclarez-les maintenant pour pouvoir leur prendre
          rendez-vous tout de suite.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            {errors.root?.server && (
              <Alert variant="destructive">
                <AlertTitle>{errors.root.server.message}</AlertTitle>
              </Alert>
            )}

            {/* Ce qui est ACQUIS, affiché à part de l'erreur : sans ce
                message, on croirait avoir tout perdu. */}
            {savedCount > 0 && (
              <Alert>
                <AlertTitle>
                  {savedCount === 1
                    ? "1 animal a bien été enregistré."
                    : `${savedCount} animaux ont bien été enregistrés.`}{" "}
                  Les fiches ci-dessous restent à enregistrer.
                </AlertTitle>
              </Alert>
            )}

            {fields.map((field, index) => (
              <FieldSet
                key={field.id}
                className="rounded-xl border p-4"
                data-invalid={!!errors.pets?.[index]}
              >
                <div className="flex items-center justify-between gap-3">
                  <FieldLegend className="flex items-center gap-2">
                    <PawPrint
                      className="size-4 text-muted-foreground"
                      aria-hidden
                    />
                    Animal {index + 1}
                  </FieldLegend>
                  {/* Une seule ligne : rien à retirer, le bouton disparaît
                      plutôt que d'être désactivé (moins de bruit visuel). */}
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => remove(index)}
                    >
                      <Trash2 data-icon="inline-start" aria-hidden />
                      <span className="hidden sm:inline">Retirer</span>
                      <span className="sr-only sm:hidden">
                        Retirer l&apos;animal {index + 1}
                      </span>
                    </Button>
                  )}
                </div>

                <FieldGroup>
                  <Field data-invalid={!!errors.pets?.[index]?.name}>
                    <FieldLabel htmlFor={`register-pet-name-${index}`}>
                      Nom
                    </FieldLabel>
                    <Input
                      id={`register-pet-name-${index}`}
                      type="text"
                      placeholder="Caramel"
                      aria-invalid={!!errors.pets?.[index]?.name}
                      {...register(`pets.${index}.name`)}
                    />
                    <FieldError errors={[errors.pets?.[index]?.name]} />
                  </Field>

                  {/* RadioGroup Base UI = composant CONTRÔLÉ : pas de value
                      exploitable par register(), l'espèce passe donc par un
                      Controller (même mécanique que PetFormDialog). */}
                  <FieldSet data-invalid={!!errors.pets?.[index]?.species}>
                    <FieldLegend>Espèce</FieldLegend>
                    <Controller
                      control={control}
                      name={`pets.${index}.species`}
                      render={({ field: speciesField }) => (
                        // value ?? "" : contrôlée dès le premier rendu
                        // (undefined la ferait basculer en non contrôlée).
                        <RadioGroup
                          value={speciesField.value ?? ""}
                          onValueChange={(value) =>
                            speciesField.onChange(value)
                          }
                          className="grid-cols-2 gap-3"
                          aria-invalid={!!errors.pets?.[index]?.species}
                        >
                          {SPECIES_ORDER.map((species) => {
                            const { label, icon: Icon } = SPECIES[species];
                            const id = `register-pet-${index}-species-${species}`;
                            return (
                              <Field key={species} orientation="horizontal">
                                <RadioGroupItem value={species} id={id} />
                                {/* htmlFor -> id de la radio : cliquer le
                                    libellé (icône comprise) coche l'option. */}
                                <FieldLabel
                                  htmlFor={id}
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
                    <FieldError errors={[errors.pets?.[index]?.species]} />
                  </FieldSet>
                </FieldGroup>
              </FieldSet>
            ))}

            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() => append(EMPTY_PET)}
              >
                <Plus data-icon="inline-start" aria-hidden />
                Ajouter un autre animal
              </Button>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Spinner data-icon="inline-start" />}
                Terminer
              </Button>
              {/* type="button" : ni soumission ni validation zod — l'étape
                  est facultative, une fiche à moitié remplie ne doit pas
                  empêcher de la sauter. */}
              <Button
                type="button"
                variant="ghost"
                disabled={isSubmitting}
                onClick={() => onDone(savedCount)}
              >
                Je le ferai plus tard
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
