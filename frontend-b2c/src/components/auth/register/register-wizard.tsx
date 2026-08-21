/**
 * RegisterWizard : l'orchestrateur du parcours d'inscription en 3 étapes.
 *
 * Assemble le fil d'Ariane, l'étape courante et l'écran de bienvenue final.
 * Chaque étape est un composant autonome qui fait SON appel API et prévient le
 * wizard quand elle est terminée.
 *
 * PAS de useReducer ici, contrairement au tunnel de réservation
 * (booking-state.ts). Ce reducer-là existe pour un invariant précis :
 * « changer un choix en amont invalide tout l'aval » (re-choisir la clinique
 * rend le créneau caduc). Cet invariant n'a pas d'équivalent ici : chaque
 * étape est DÉJÀ écrite côté serveur quand on la quitte, il n'y a donc rien à
 * invalider. Deux useState suffisent, et en ajouter davantage serait de la
 * machinerie sans objet.
 *
 * Deux points méritent l'attention :
 *
 * 1. LE GARDE. Le compte est créé dès l'étape 1, donc la session est ouverte
 *    pendant les étapes 2 et 3. Sans le commutateur `enabled`, le GuestGuard
 *    (« un connecté n'a rien à faire sur /register ») éjecterait la personne
 *    vers /account au beau milieu de son inscription.
 * 2. LE RETOUR EN ARRIÈRE. Il s'arrête à l'étape 2 (minStep) : revenir à
 *    l'étape 1 n'aurait aucun sens, le compte existe déjà et le formulaire de
 *    création n'a plus rien à créer.
 */
"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { GuestGuard } from "@/components/auth/guest-guard";
import { StepAccount } from "@/components/auth/register/step-account";
import { StepAddress } from "@/components/auth/register/step-address";
import { StepPets } from "@/components/auth/register/step-pets";
import { StepIndicator } from "@/components/common/step-indicator";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useCurrentUser } from "@/lib/auth/use-current-user";

// Libellés des trois étapes, dans l'ordre. L'index + 1 EST le numéro d'étape.
const STEP_LABELS = ["Compte", "Adresse", "Animaux"] as const;

// Numéro de la première étape sur laquelle un retour reste possible : une fois
// le compte créé, l'étape 1 est définitivement derrière nous.
const FIRST_REACHABLE_STEP = 2;

type RegisterStep = 1 | 2 | 3;

export function RegisterWizard() {
  const [step, setStep] = useState<RegisterStep>(1);
  // null tant que le parcours n'est pas terminé ; sinon le nombre d'animaux
  // effectivement enregistrés, pour personnaliser l'écran de bienvenue.
  const [createdPets, setCreatedPets] = useState<number | null>(null);
  const { data: owner } = useCurrentUser();

  // Écran de bienvenue : remplace le wizard et le fil d'Ariane. Il n'est pas
  // sous GuestGuard — à ce stade la session est ouverte, et c'est voulu.
  if (createdPets !== null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            Bienvenue{owner !== undefined ? ` ${owner.first_name}` : ""} !
          </CardTitle>
          <CardDescription>
            Votre compte est prêt.{" "}
            {createdPets === 0
              ? "Ajoutez vos animaux quand vous voulez depuis votre espace."
              : createdPets === 1
                ? "Votre compagnon est enregistré."
                : `Vos ${createdPets} compagnons sont enregistrés.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {/* nativeButton={false} : le Button est rendu comme un <Link>
              Next.js via la prop render (Base UI n'a pas asChild). */}
          <Button
            nativeButton={false}
            render={<Link href="/rendez-vous/nouveau" />}
          >
            Prendre rendez-vous
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/account" />}
          >
            Mon compte
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    // enabled={step === 1} : voir le point 1 de la docstring.
    <GuestGuard enabled={step === 1}>
      <div className="flex flex-col gap-6">
        <StepIndicator
          labels={STEP_LABELS}
          ariaLabel="Étapes de l'inscription"
          step={step}
          minStep={FIRST_REACHABLE_STEP}
          onStepClick={(target) => setStep(target as RegisterStep)}
        />

        {/* Bouton Retour à partir de l'étape 3 seulement : à l'étape 2, la
            seule marche arrière serait l'étape 1, désormais close. */}
        {step === 3 && (
          <div>
            <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
              <ChevronLeft data-icon="inline-start" aria-hidden />
              Retour
            </Button>
          </div>
        )}

        {step === 1 && <StepAccount onCreated={() => setStep(2)} />}
        {step === 2 && <StepAddress onDone={() => setStep(3)} />}
        {step === 3 && <StepPets onDone={setCreatedPets} />}
      </div>
    </GuestGuard>
  );
}
