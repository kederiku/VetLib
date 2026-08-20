/**
 * Etape 1 du wizard : choisir la clinique.
 *
 * L'annuaire public (GET /public/clinics) est charge en une fois
 * (limit 100 — largement au-dessus du volume du MVP) puis FILTRE COTE
 * CLIENT : un champ de recherche insensible a la casse ET aux accents
 * ("HERAULT" trouve "Hérault"). Chaque clinique est un vrai <button>
 * pleine largeur style comme une carte : le clic selectionne ET avance
 * (dispatch SELECT_CLINIC, le reducer passe a l'etape 2).
 */
"use client";

import { MapPin, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useListClinics } from "@/lib/api/generated/public-clinics/public-clinics";
import type { PublicClinicResponse } from "@/lib/api/generated/vetoLibAPI.schemas";

/**
 * Normalisation pour la recherche : minuscules puis decomposition NFD
 * (é -> e + accent combinant) et suppression des diacritiques. Appliquee
 * au filtre ET aux valeurs comparees : les deux cotes jouent avec les
 * memes regles.
 */
function normalizeSearch(value: string): string {
  // \u0300-\u036f : le bloc Unicode des diacritiques combinants,
  // produits par la decomposition NFD.
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

interface StepClinicProps {
  onSelect: (clinic: PublicClinicResponse) => void;
}

export function StepClinic({ onSelect }: StepClinicProps) {
  const [search, setSearch] = useState("");

  const {
    data: clinics,
    isPending,
    isError,
  } = useListClinics(
    { limit: 100, offset: 0 },
    // Narrowing : l'union generee inclut la variante 422, mais le
    // mutator jette sur tout statut >= 400 — data est donc toujours la
    // liste ; la branche [] n'existe que pour satisfaire TypeScript.
    { query: { select: (res) => (res.status === 200 ? res.data : []) } },
  );

  // Filtre derive (useMemo) : recalcule quand la saisie ou la liste
  // change. On cherche dans le nom ET la ville.
  const filtered = useMemo(() => {
    const needle = normalizeSearch(search.trim());
    if (needle === "") {
      return clinics ?? [];
    }
    return (clinics ?? []).filter(
      (clinic) =>
        normalizeSearch(clinic.name).includes(needle) ||
        (clinic.city !== null && normalizeSearch(clinic.city).includes(needle)),
    );
  }, [clinics, search]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Choisissez votre clinique
        </h2>
        <p className="text-sm text-muted-foreground">
          Recherchez par nom ou par ville.
        </p>
      </div>

      {/* Recherche : simple etat local, aucune requete reseau au fil de
          la frappe (tout l'annuaire est deja la). */}
      <div className="relative">
        <Search
          className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          placeholder="Nom de la clinique ou ville"
          aria-label="Rechercher une clinique"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="pl-9"
        />
      </div>

      {isPending && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {isError && (
        <Alert variant="destructive">
          <AlertTitle>
            Impossible de charger les cliniques. Vérifiez votre connexion et
            réessayez.
          </AlertTitle>
        </Alert>
      )}

      {clinics !== undefined && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Aucune clinique ne correspond à votre recherche.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {filtered.map((clinic) => (
          // Un vrai <button> (et non un div clicable) : focusable au
          // clavier, active par Entree/Espace, annonce par les lecteurs
          // d'ecran. Style de carte via Tailwind uniquement.
          <button
            key={clinic.id}
            type="button"
            onClick={() => onSelect(clinic)}
            className="flex w-full flex-col gap-1 rounded-2xl border bg-card p-4 text-left text-card-foreground transition-colors outline-none hover:border-primary/40 hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <span className="font-medium">{clinic.name}</span>
            {clinic.city !== null && (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="size-3.5" aria-hidden />
                {clinic.city}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
