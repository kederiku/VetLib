/**
 * Carte « Mes animaux » du tableau de bord.
 *
 * Chaque animal est un lien vers sa section, avec sous lui l'information
 * qui répond à une vraie question : « quand ai-je vu le vétérinaire pour
 * Caramel ? ». Prochain rendez-vous s'il y en a un, sinon dernière
 * visite, sinon rien d'enregistré — dérivé du cache des rendez-vous,
 * donc sans requête supplémentaire.
 *
 * Volontairement PAS un compteur (« 3 animaux ») : un chiffre que
 * l'utilisateur lit d'un coup d'oeil sur sa propre liste n'apporte rien,
 * et n'ouvre sur aucune action.
 */
"use client";

import { ChevronRightIcon, PawPrintIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PetFormDialog } from "@/components/pets/pet-form-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useListMyPets } from "@/lib/api/generated/pets/pets";
import { lastVisit, nextForPet } from "@/lib/appointments/derive";
import { useMyAppointments } from "@/lib/appointments/use-my-appointments";
import { formatDateShort } from "@/lib/date/format";
import { SPECIES } from "@/lib/pets/species";

export function PetsSummaryCard({ now }: { now: Date }) {
  const {
    data: pets,
    isPending,
    isError,
    refetch,
  } = useListMyPets({ query: { select: (res) => res.data } });
  // Même queryKey que partout : la sous-ligne ne coûte aucune requête.
  const { data: appointments } = useMyAppointments();
  const [formOpen, setFormOpen] = useState(false);

  /** « Prochain RDV : 24 août » / « Dernière visite : ... » / rien. */
  const sousLigne = (petId: string): string => {
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
    <Card>
      <CardHeader>
        <CardTitle>Mes animaux</CardTitle>
        {/* Masquee quand la liste est vide : l'etat vide porte deja son
            propre CTA, et deux boutons "Ajouter un animal" a l'ecran
            seraient un doublon -- y compris pour un lecteur d'ecran, qui
            annoncerait deux fois la meme action. */}
        {pets !== undefined && pets.length > 0 && (
          <CardAction>
            <Button
              variant="ghost"
              size="sm"
              // Meme raison qu'au header : un seul nom accessible, quel
              // que soit ce que le CSS montre.
              aria-label="Ajouter un animal"
              onClick={() => setFormOpen(true)}
            >
              <PlusIcon data-icon="inline-start" aria-hidden />
              <span className="hidden sm:inline">Ajouter</span>
            </Button>
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-2">
        {isPending && (
          <>
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </>
        )}

        {isError && (
          <ErrorState
            title="Impossible de charger vos animaux."
            onRetry={() => void refetch()}
          />
        )}

        {pets !== undefined && pets.length === 0 && (
          <EmptyState
            className=""
            icon={<PawPrintIcon aria-hidden />}
            title="Aucun animal enregistré"
            description="Chien, chat, NAC... Enregistrez vos compagnons pour leur prendre rendez-vous."
            action={
              <Button onClick={() => setFormOpen(true)}>
                <PlusIcon data-icon="inline-start" aria-hidden />
                Ajouter un animal
              </Button>
            }
          />
        )}

        {pets !== undefined && pets.length > 0 && (
          <ul className="flex flex-col gap-1">
            {pets.map((pet) => {
              const { label, icon: Icon } = SPECIES[pet.species];
              return (
                <li key={pet.id}>
                  <Link
                    href="/animaux"
                    className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-muted">
                      <Icon className="size-4 text-brand" aria-hidden />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">
                        {pet.name}
                        <span className="sr-only"> — {label}</span>
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {sousLigne(pet.id)}
                      </span>
                    </span>
                    <ChevronRightIcon
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      {/* Dialogue de création, piloté d'ici : ajouter un animal depuis le
          tableau de bord évite un aller-retour par la page dédiée. */}
      <PetFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </Card>
  );
}
