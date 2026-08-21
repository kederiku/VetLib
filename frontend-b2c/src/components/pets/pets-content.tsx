/**
 * Contenu de la page /animaux : la grille des compagnons du propriétaire.
 *
 * Une GRILLE de cartes et non une liste : un propriétaire a un à quatre
 * animaux, une grille les montre tous d'un coup d'oeil là où une colonne
 * les empile. Chaque carte mène à la fiche, où vivent désormais les
 * actions (modifier, supprimer) — voir la docstring de pet-card.
 *
 * Le pied de chaque carte porte le suivi de l'animal (prochain
 * rendez-vous, sinon dernière visite), dérivé du cache des rendez-vous :
 * même queryKey que la page /rendez-vous, donc aucune requête ajoutée.
 */
"use client";

import { PawPrint, Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { PetCard } from "@/components/pets/pet-card";
import { PetFormDialog } from "@/components/pets/pet-form-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useListMyPets } from "@/lib/api/generated/pets/pets";
import { lastVisit, nextForPet } from "@/lib/appointments/derive";
import { useMyAppointments } from "@/lib/appointments/use-my-appointments";
import { formatDateShort } from "@/lib/date/format";

export function PetsContent() {
  const {
    data: pets,
    isPending,
    isError,
    refetch,
  } = useListMyPets({ query: { select: (res) => res.data } });
  const { data: appointments } = useMyAppointments();
  const [formOpen, setFormOpen] = useState(false);

  // "Maintenant" fige par rendu : l'age affiche et la frontiere
  // futur/passe sont les memes pour toutes les cartes.
  const now = useMemo(() => new Date(), []);

  /** « Prochain rendez-vous : 24 août » / « Dernière visite : ... ». */
  const suivi = (petId: string): string => {
    if (appointments === undefined) return "";
    const prochain = nextForPet(appointments, petId, now);
    if (prochain !== null) {
      return `Prochain rendez-vous : ${formatDateShort(prochain.starts_at)}`;
    }
    const derniere = lastVisit(appointments, petId, now);
    if (derniere !== null) {
      return `Dernière visite : ${formatDateShort(derniere.starts_at)}`;
    }
    return "Aucune visite enregistrée";
  };

  return (
    <PageContainer>
      <PageHeader
        title="Mes animaux"
        description="Les compagnons pour lesquels vous prenez rendez-vous."
        actions={
          pets !== undefined && pets.length > 0 ? (
            <Button onClick={() => setFormOpen(true)}>
              <Plus data-icon="inline-start" aria-hidden />
              Ajouter un animal
            </Button>
          ) : undefined
        }
      />

      {/* Squelettes dans la MEME grille que les cartes : sans cela, la
          mise en page sauterait a l'arrivee des donnees. */}
      {isPending && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-40 w-full rounded-4xl" />
          <Skeleton className="h-40 w-full rounded-4xl" />
          <Skeleton className="h-40 w-full rounded-4xl" />
        </div>
      )}

      {isError && (
        <ErrorState
          title="Impossible de charger vos animaux."
          onRetry={() => void refetch()}
        />
      )}

      {pets !== undefined && pets.length === 0 && (
        <EmptyState
          icon={<PawPrint aria-hidden />}
          title="Ajoutez votre premier compagnon"
          description="Chien, chat, NAC... Enregistrez vos animaux pour leur prendre rendez-vous en quelques clics."
          action={
            <Button onClick={() => setFormOpen(true)}>
              <Plus data-icon="inline-start" aria-hidden />
              Ajouter un animal
            </Button>
          }
        />
      )}

      {pets !== undefined && pets.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {pets.map((pet) => (
            <li key={pet.id}>
              <PetCard pet={pet} suivi={suivi(pet.id)} now={now} />
            </li>
          ))}
        </ul>
      )}

      {/* Dialogue de creation, pilote d'ici. L'edition, elle, vit sur la
          fiche de chaque animal. */}
      <PetFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </PageContainer>
  );
}
