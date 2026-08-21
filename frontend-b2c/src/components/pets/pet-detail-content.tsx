/**
 * Fiche d'un animal : son identité et son historique de rendez-vous.
 *
 * C'est l'écran qui manquait au portail : jusqu'ici « Mes animaux »
 * n'était qu'une liste de noms, sans moyen de savoir quand on avait vu
 * le vétérinaire pour lequel.
 *
 * La fiche est lue via getMyPet plutôt que dérivée de la liste : à
 * l'inverse des rendez-vous, arriver ici par un lien partagé ou un F5
 * est un cas normal (c'est une page qu'on met en favori), et un endpoint
 * unitaire évite alors de charger toute la liste pour n'en garder qu'un.
 * L'historique, lui, EST dérivé du cache des rendez-vous — cette
 * liste-là est de toute façon déjà chargée par le reste du portail.
 */
"use client";

import { ChevronLeftIcon, PawPrintIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { DeletePetDialog } from "@/components/pets/delete-pet-dialog";
import { PetAppointmentsCard } from "@/components/pets/pet-appointments-card";
import { PetFormDialog } from "@/components/pets/pet-form-dialog";
import { PetIdentityCard } from "@/components/pets/pet-identity-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { PageContainer } from "@/components/shared/page-container";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApiError } from "@/lib/api/errors";
import { useGetMyPet } from "@/lib/api/generated/pets/pets";
import type { PetResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import { useMyAppointments } from "@/lib/appointments/use-my-appointments";
import { formatPetSubtitle } from "@/lib/pets/attributes";
import { SPECIES } from "@/lib/pets/species";

/** Le lien de retour, présent dans tous les états de la page. */
function RetourListe() {
  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        nativeButton={false}
        render={<Link href="/animaux" />}
      >
        <ChevronLeftIcon data-icon="inline-start" aria-hidden />
        Retour à mes animaux
      </Button>
    </div>
  );
}

export function PetDetailContent({ id }: { id: string }) {
  const router = useRouter();
  const {
    data: pet,
    isPending,
    isError,
    error,
    refetch,
    // TError = ApiError : le mutator normalise toute reponse >= 400 en
    // ApiError avant de la jeter, y compris le 404 de cet endpoint.
  } = useGetMyPet<PetResponse | undefined, ApiError>(id, {
    query: {
      // L'union generee inclut la variante 422 ; a l'execution le
      // mutator a deja jete sur tout statut >= 400, donc on est
      // forcement en 200 ici -- le narrowing est pour TypeScript.
      select: (res) => (res.status === 200 ? res.data : undefined),
      // retry: false : un 404 signifie "cet animal n'est pas a vous",
      // pas une panne passagere. Reessayer trois fois ferait patienter
      // pour rien avant d'afficher "introuvable".
      retry: false,
    },
  });
  const { data: appointments } = useMyAppointments();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const now = useMemo(() => new Date(), []);

  if (isPending) {
    return (
      <PageContainer>
        <RetourListe />
        <Skeleton className="h-16 w-64" />
        <div className="grid items-start gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 w-full rounded-4xl" />
          <Skeleton className="h-64 w-full rounded-4xl lg:col-span-2" />
        </div>
      </PageContainer>
    );
  }

  // 404 : l'animal n'existe plus, ou n'a jamais ete a ce proprietaire
  // (le backend ne fait volontairement pas la difference). Tout autre
  // echec est une panne, qui merite un bouton Reessayer. `pet` indefini
  // sans erreur est theorique (le mutator jette avant), mais il ferme le
  // narrowing pour la suite.
  if (isError || pet === undefined) {
    const introuvable = error?.status === 404 || !isError;
    return (
      <PageContainer>
        <RetourListe />
        {introuvable ? (
          <EmptyState
            icon={<PawPrintIcon aria-hidden />}
            title="Animal introuvable"
            description="Cette fiche n'existe plus ou ne vous appartient pas. Revenez à la liste pour retrouver vos compagnons."
          />
        ) : (
          <ErrorState
            title="Impossible de charger cette fiche."
            onRetry={() => void refetch()}
          />
        )}
      </PageContainer>
    );
  }

  const { icon: Icon } = SPECIES[pet.species];

  return (
    <PageContainer>
      <RetourListe />

      {/* En-tete identitaire : pastille XL, nom, sous-titre compose, et
          l'action principale de la fiche. PageHeader n'est pas utilise
          ici : il n'a pas de place pour la pastille d'espece, qui est le
          repere visuel de l'animal. */}
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-brand-muted">
          <Icon className="size-8 text-brand" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="truncate text-2xl font-bold tracking-tight">
            {pet.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {formatPetSubtitle(pet, now)}
          </p>
        </div>
        <Button
          nativeButton={false}
          render={<Link href={`/rendez-vous/nouveau?animal=${pet.id}`} />}
        >
          <PlusIcon data-icon="inline-start" aria-hidden />
          Prendre rendez-vous
        </Button>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <PetIdentityCard
          pet={pet}
          now={now}
          onEdit={() => setFormOpen(true)}
          onDelete={() => setDeleteOpen(true)}
        />
        <PetAppointmentsCard
          className="lg:col-span-2"
          appointments={appointments}
          petId={pet.id}
          petName={pet.name}
          now={now}
        />
      </div>

      <PetFormDialog open={formOpen} onOpenChange={setFormOpen} pet={pet} />

      {/* onDeleted : sans lui, la page resterait montee sur un animal qui
          n'existe plus et basculerait sur "introuvable" -- ce qui
          ressemblerait a une erreur alors que la suppression a reussi. */}
      <DeletePetDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        pet={pet}
        onDeleted={() => router.replace("/animaux")}
      />
    </PageContainer>
  );
}
