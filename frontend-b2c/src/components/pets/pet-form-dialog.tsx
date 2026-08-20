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
 */
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
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
  useUpdatePet,
} from "@/lib/api/generated/pets/pets";
import type { PetResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import { applyServerErrors } from "@/lib/auth/server-errors";
import { petSchema, type PetFormValues } from "@/lib/pets/schemas";
import { SPECIES, SPECIES_ORDER } from "@/lib/pets/species";

// Champs que ce formulaire affiche : une erreur 422 sur un autre champ
// partirait dans le bandeau global (voir applyServerErrors).
const KNOWN_FIELDS = ["name", "species"] as const;

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
    // dialogue est ouvert. species reste indefinie en creation : c'est
    // le schema zod qui reclamera un choix a la soumission.
    defaultValues: {
      name: pet?.name ?? "",
      species: pet?.species,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      // Creation (POST complet) ou edition (PATCH partiel : on envoie
      // les deux champs, le backend n'ecrase que le non-null).
      const res = isEditing
        ? await updateMutation.mutateAsync({
            petId: pet.id,
            data: { name: values.name, species: values.species },
          })
        : await createMutation.mutateAsync({
            data: { name: values.name, species: values.species },
          });

      // La liste des animaux est peut-etre affichee derriere le dialogue
      // (ou dans le wizard) : invalider par sa cle la fait se rafraichir
      // partout ou elle est montee.
      await queryClient.invalidateQueries({
        queryKey: getListMyPetsQueryKey(),
      });

      // Narrowing TypeScript : l'union generee inclut la variante 422,
      // mais le mutator jette sur tout statut >= 400 — a l'execution on
      // est forcement en 200/201 ici.
      if (res.status === 200 || res.status === 201) {
        onSaved?.(res.data);
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
            ? "Mettez à jour le nom ou l'espèce de votre compagnon."
            : "Renseignez votre compagnon pour lui prendre rendez-vous."}
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
                          <Icon className="size-4 text-muted-foreground" aria-hidden />
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
