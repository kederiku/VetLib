/**
 * Carte « Identité » de la fiche animal.
 *
 * Une liste de définitions (<dl>) et non une grille de <div> : la
 * relation libellé-valeur est portée par le HTML, donc annoncée
 * correctement par un lecteur d'écran, au lieu d'être seulement
 * suggérée par la mise en page.
 *
 * Chaque champ non renseigné affiche « Non renseigné » plutôt qu'un
 * blanc : un vide silencieux laisse croire à un bug ou à une donnée
 * perdue, là où une mention explicite dit « c'est à vous de le
 * compléter ».
 */
"use client";

import { PencilIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PetResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import { formatDateLong } from "@/lib/date/format";
import { formatAge, formatSterilized, SEX_LABELS } from "@/lib/pets/attributes";
import { SPECIES } from "@/lib/pets/species";

/** Une ligne de la liste de définitions. */
function Ligne({ terme, valeur }: { terme: string; valeur: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-muted-foreground">{terme}</dt>
      <dd className="text-sm">
        {valeur ?? (
          <span className="text-muted-foreground italic">Non renseigné</span>
        )}
      </dd>
    </div>
  );
}

interface PetIdentityCardProps {
  pet: PetResponse;
  now: Date;
  onEdit: () => void;
  onDelete: () => void;
}

export function PetIdentityCard({
  pet,
  now,
  onEdit,
  onDelete,
}: PetIdentityCardProps) {
  const age = formatAge(pet.birth_date, now);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identité</CardTitle>
        <CardAction>
          <Button variant="outline" size="sm" onClick={onEdit}>
            <PencilIcon data-icon="inline-start" aria-hidden />
            Modifier
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Ligne terme="Espèce" valeur={SPECIES[pet.species].label} />
          <Ligne terme="Race" valeur={pet.breed} />
          <Ligne
            terme="Date de naissance"
            valeur={
              pet.birth_date === null
                ? null
                : `${formatDateLong(`${pet.birth_date}T12:00:00Z`)}${age !== null ? ` (${age})` : ""}`
            }
          />
          {/* Le sexe a toujours une valeur : "Non précisé" est un membre
              de l'enum, pas une absence -- d'où l'absence d'italique. */}
          <Ligne terme="Sexe" valeur={SEX_LABELS[pet.sex]} />
          <Ligne
            terme="Stérilisation"
            valeur={formatSterilized(pet.sterilized)}
          />
        </dl>
      </CardContent>

      <CardFooter>
        {/* Action destructive EN BAS et en variante discrete : elle ne se
            met pas là où l'on clique par réflexe. */}
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2Icon data-icon="inline-start" aria-hidden />
          Supprimer {pet.name}
        </Button>
      </CardFooter>
    </Card>
  );
}
