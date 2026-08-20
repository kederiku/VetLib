/**
 * Etape 3 du wizard : choisir l'animal et preciser un motif libre.
 *
 * Contrairement aux etapes 1 et 2 (clic = avance), cette etape a DEUX
 * saisies (animal + commentaire optionnel) : la selection de l'animal ne
 * fait que cocher (SELECT_PET), c'est le bouton Continuer (CONFIRM_PET)
 * qui avance — desactive tant qu'aucun animal n'est coche.
 *
 * La RadioGroup est branchee DIRECTEMENT sur l'etat du wizard (value =
 * pet.id du reducer, onValueChange = dispatch), sans etat local ni
 * react-hook-form : une seule source de verite. Le dialogue "Ajouter un
 * animal" (PetFormDialog, le meme que la page /animaux) est reutilisable
 * ici : son onSaved coche automatiquement l'animal tout juste cree.
 */
"use client";

import { PawPrint, Plus } from "lucide-react";
import { useState } from "react";

import { PetFormDialog } from "@/components/pets/pet-form-dialog";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useListMyPets } from "@/lib/api/generated/pets/pets";
import type { PetResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import { SPECIES } from "@/lib/pets/species";

interface StepPetProps {
  selectedPet: PetResponse | null;
  reason: string;
  /** Message d'erreur du wizard (ex : animal supprime entre-temps). */
  errorMessage: string | null;
  onSelectPet: (pet: PetResponse) => void;
  onReasonChange: (reason: string) => void;
  onContinue: () => void;
}

export function StepPet({
  selectedPet,
  reason,
  errorMessage,
  onSelectPet,
  onReasonChange,
  onContinue,
}: StepPetProps) {
  const {
    data: pets,
    isPending,
    isError,
  } = useListMyPets({ query: { select: (res) => res.data } });

  // Ouverture du dialogue d'ajout (reutilise tel quel depuis /animaux).
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Pour quel animal ?
        </h2>
        <p className="text-sm text-muted-foreground">
          Le rendez-vous sera rattaché à son dossier.
        </p>
      </div>

      {/* Erreur remontee par la confirmation (pet_not_found apres
          suppression dans un autre onglet, par exemple). */}
      {errorMessage !== null && (
        <Alert variant="destructive">
          <AlertTitle>{errorMessage}</AlertTitle>
        </Alert>
      )}

      {isPending && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {isError && (
        <Alert variant="destructive">
          <AlertTitle>
            Impossible de charger vos animaux. Vérifiez votre connexion et
            réessayez.
          </AlertTitle>
        </Alert>
      )}

      {/* Aucun animal : impossible de continuer sans en creer un. */}
      {pets !== undefined && pets.length === 0 && (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PawPrint aria-hidden />
            </EmptyMedia>
            <EmptyTitle>Aucun animal enregistré</EmptyTitle>
            <EmptyDescription>
              Ajoutez votre compagnon pour poursuivre la réservation.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setAddOpen(true)}>
              <Plus data-icon="inline-start" aria-hidden />
              Ajouter un animal
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {pets !== undefined && pets.length > 0 && (
        <>
          {/* value/onValueChange branches sur le reducer du wizard : la
              radio COCHE (SELECT_PET) sans avancer. value ?? "" : groupe
              controle des le premier rendu. */}
          <RadioGroup
            aria-label="Choix de l'animal"
            value={selectedPet?.id ?? ""}
            onValueChange={(value) => {
              const pet = pets.find((candidate) => candidate.id === value);
              if (pet !== undefined) {
                onSelectPet(pet);
              }
            }}
            className="gap-2"
          >
            {pets.map((pet) => {
              const { label, icon: Icon } = SPECIES[pet.species];
              return (
                <Field
                  key={pet.id}
                  orientation="horizontal"
                  className="rounded-2xl border bg-card p-3"
                >
                  <RadioGroupItem value={pet.id} id={`booking-pet-${pet.id}`} />
                  <FieldLabel
                    htmlFor={`booking-pet-${pet.id}`}
                    className="flex-1 font-normal"
                  >
                    <span className="flex size-8 items-center justify-center rounded-full bg-brand-muted">
                      <Icon className="size-4 text-brand" aria-hidden />
                    </span>
                    <span className="font-medium">{pet.name}</span>
                    <span className="text-muted-foreground">{label}</span>
                  </FieldLabel>
                </Field>
              );
            })}
          </RadioGroup>

          {/* Lien d'ajout au fil du parcours : pas besoin de quitter le
              wizard pour declarer un nouvel animal. */}
          <div>
            <Button variant="ghost" size="sm" onClick={() => setAddOpen(true)}>
              <Plus data-icon="inline-start" aria-hidden />
              Ajouter un animal
            </Button>
          </div>

          <Field>
            <FieldLabel htmlFor="booking-reason">
              Motif ou précisions{" "}
              <span className="font-normal text-muted-foreground">
                (optionnel)
              </span>
            </FieldLabel>
            {/* maxLength natif : borne cote client alignee sur le
                backend ; la valeur vit dans le reducer (SET_REASON). */}
            <Textarea
              id="booking-reason"
              maxLength={500}
              placeholder="Boite depuis quelques jours, vaccins à jour..."
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
            />
            <FieldDescription>
              Transmis à la clinique avec votre demande.
            </FieldDescription>
          </Field>

          <div>
            {/* Continuer : desactive sans animal coche (le reducer a le
                meme garde-fou cote CONFIRM_PET). */}
            <Button onClick={onContinue} disabled={selectedPet === null}>
              Continuer
            </Button>
          </div>
        </>
      )}

      {/* Dialogue partage avec /animaux ; onSaved coche l'animal cree. */}
      <PetFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={onSelectPet}
      />
    </div>
  );
}
