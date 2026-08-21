/**
 * Contenu de la page /animaux : la liste des compagnons du proprietaire.
 *
 * Une carte par animal (icone d'espece, nom, badge, actions Renommer /
 * Supprimer), un bouton "Ajouter un animal" en tete, et un etat vide
 * engageant pour le premier animal. Les deux dialogues (formulaire et
 * confirmation de suppression) sont piletes d'ici : l'etat local
 * memorise QUEL animal est vise par quelle action.
 *
 * Client Component : liste via useListMyPets (TanStack Query) ; le cache
 * est partage avec le wizard de prise de rendez-vous (meme queryKey).
 */
"use client";

import { PawPrint, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { DeletePetDialog } from "@/components/pets/delete-pet-dialog";
import { PetFormDialog } from "@/components/pets/pet-form-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useListMyPets } from "@/lib/api/generated/pets/pets";
import type { PetResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import { SPECIES } from "@/lib/pets/species";

export function PetsContent() {
  // select extrait le tableau une fois pour tous les rendus (le mutator
  // renvoie { status, data, headers }).
  const {
    data: pets,
    isPending,
    isError,
    refetch,
  } = useListMyPets({ query: { select: (res) => res.data } });

  // Etats des dialogues. formPet : l'animal en cours d'edition (undefined
  // = creation). deletePet : l'animal vise par la suppression. formOpen
  // est separe de formPet pour distinguer "ouvert en creation" (formPet
  // undefined) de "ferme".
  const [formOpen, setFormOpen] = useState(false);
  const [formPet, setFormPet] = useState<PetResponse | undefined>(undefined);
  const [deletePet, setDeletePet] = useState<PetResponse | null>(null);

  const openCreate = () => {
    setFormPet(undefined);
    setFormOpen(true);
  };

  const openEdit = (pet: PetResponse) => {
    setFormPet(pet);
    setFormOpen(true);
  };

  return (
    <PageContainer>
      <PageHeader
        title="Mes animaux"
        description="Les compagnons pour lesquels vous prenez rendez-vous."
        actions={
          <Button onClick={openCreate}>
            <Plus data-icon="inline-start" aria-hidden />
            Ajouter un animal
          </Button>
        }
      />

      {/* Squelettes pendant le chargement : meme silhouette que les
          cartes, pas de saut de mise en page a l'arrivee des donnees. */}
      {isPending && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {/* Erreur AVEC issue : l'ancien bandeau n'offrait aucun moyen de
          relancer, il fallait recharger la page à la main. */}
      {isError && (
        <ErrorState
          title="Impossible de charger vos animaux."
          onRetry={() => void refetch()}
        />
      )}

      {/* Etat vide : premier contact avec la fonctionnalite, ton
          engageant + CTA identique au bouton du haut. */}
      {pets !== undefined && pets.length === 0 && (
        <EmptyState
          icon={<PawPrint aria-hidden />}
          title="Ajoutez votre premier compagnon"
          description="Chien, chat, NAC... Enregistrez vos animaux pour leur prendre rendez-vous en quelques clics."
          action={
            <Button onClick={openCreate}>
              <Plus data-icon="inline-start" aria-hidden />
              Ajouter un animal
            </Button>
          }
        />
      )}

      {pets !== undefined && pets.length > 0 && (
        <div className="flex flex-col gap-3">
          {pets.map((pet) => {
            const { label, icon: Icon } = SPECIES[pet.species];
            return (
              <Card key={pet.id}>
                <CardContent className="flex items-center gap-4">
                  {/* Pastille d'espece : cercle teinte marque + icone. */}
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-muted">
                    <Icon className="size-5 text-brand" aria-hidden />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate font-medium">{pet.name}</span>
                    <Badge variant="secondary">{label}</Badge>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(pet)}
                    >
                      <Pencil data-icon="inline-start" aria-hidden />
                      {/* Sur mobile, l'icone seule suffit. */}
                      <span className="hidden sm:inline">Renommer</span>
                      <span className="sr-only sm:hidden">
                        Renommer {pet.name}
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setDeletePet(pet)}
                    >
                      <Trash2 data-icon="inline-start" aria-hidden />
                      <span className="hidden sm:inline">Supprimer</span>
                      <span className="sr-only sm:hidden">
                        Supprimer {pet.name}
                      </span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialogue creation/edition : formPet decide du mode. */}
      <PetFormDialog open={formOpen} onOpenChange={setFormOpen} pet={formPet} />

      {/* Dialogue de suppression : monte seulement quand un animal est
          vise (deletePet porte a la fois "ouvert" et "lequel"). */}
      {deletePet !== null && (
        <DeletePetDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeletePet(null);
          }}
          pet={deletePet}
        />
      )}
    </PageContainer>
  );
}
