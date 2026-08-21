/**
 * Carte d'un animal dans la grille « Mes animaux ».
 *
 * La carte ENTIERE est un lien vers la fiche : c'est l'action attendue
 * quand on clique sur un animal. « Modifier » et « Supprimer » ont donc
 * quitté la liste pour la fiche, à un clic de là — trois raisons.
 * D'abord des boutons imbriqués dans une carte-lien produisent des
 * contrôles emboîtés, au comportement clavier ambigu. Ensuite
 * « Renommer » ne décrivait plus l'action une fois la fiche enrichie (on
 * modifie une race, une date). Enfin une grille sans boutons répétés est
 * simplement plus calme à regarder.
 *
 * Le pied de carte porte l'information qui répond à une vraie question :
 * « quand ai-je vu le vétérinaire pour Caramel ? » — dérivée du cache
 * des rendez-vous, sans requête supplémentaire.
 */
"use client";

import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import type { PetResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import { formatPetSubtitle } from "@/lib/pets/attributes";
import { SPECIES } from "@/lib/pets/species";

interface PetCardProps {
  pet: PetResponse;
  /** Ligne de pied : prochain rendez-vous, dernière visite, ou rien. */
  suivi: string;
  now: Date;
}

export function PetCard({ pet, suivi, now }: PetCardProps) {
  const { icon: Icon } = SPECIES[pet.species];

  return (
    // Le lien ENVELOPPE la carte : Card est un simple <div> du preset,
    // sans prop render. La carte ne contenant aucun controle
    // interactif, l'imbrication est sans risque d'ambiguite clavier.
    <Link
      href={`/animaux/${pet.id}`}
      className="rounded-4xl focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
    >
      <Card className="h-full transition-colors hover:bg-muted/50">
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-4">
            {/* Pastille d'espece : cercle teinte marque + icone. */}
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-muted">
              <Icon className="size-6 text-brand" aria-hidden />
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-lg font-semibold">{pet.name}</span>
              <span className="truncate text-sm text-muted-foreground">
                {formatPetSubtitle(pet, now)}
              </span>
            </span>
          </div>
          <span className="border-t pt-3 text-xs text-muted-foreground">
            {suivi}
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
