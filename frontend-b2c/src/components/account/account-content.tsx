/**
 * Contenu de la page /account : la fiche du propriétaire connecté.
 *
 * Deux cartes : "Mon profil" (formulaire d'édition, composant dédié
 * ProfileForm) et "Mon compte" (email en lecture seule + déconnexion),
 * suivies d'un aperçu de la suite du portail (espace animaux à venir).
 * Client Component : il lit la session via useCurrentUser, un hook
 * TanStack Query.
 */
"use client";

import { PawPrint } from "lucide-react";

import { LogoutButton } from "@/components/auth/logout-button";
import { ProfileForm } from "@/components/account/profile-form";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useCurrentUser } from "@/lib/auth/use-current-user";

export function AccountContent() {
  const { data: owner } = useCurrentUser();

  // L'AuthGuard (layout parent) garantit qu'on n'arrive ici que
  // connecté ; ce garde-fou couvre l'instant de transition où la query
  // n'est pas encore résolue (et rassure TypeScript sur undefined).
  if (owner === undefined) {
    return null;
  }

  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-6 p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">
          Bonjour {owner.first_name}
        </h1>
        <p className="text-muted-foreground">
          Gérez vos informations personnelles et vos préférences.
        </p>
      </div>

      {/* Carte a) : le formulaire complet de la fiche propriétaire. */}
      <ProfileForm />

      {/* Carte b) : les informations de connexion, hors formulaire. */}
      <Card>
        <CardHeader>
          <CardTitle>Mon compte</CardTitle>
          <CardDescription>Vos informations de connexion.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <Field>
            <FieldLabel htmlFor="account-email">Email</FieldLabel>
            {/* readOnly (et non disabled) : le champ reste focalisable et
                son contenu copiable, mais toute saisie est ignorée.
                L'email est l'identifiant du compte : son changement
                exigera un flux dédié (vérification par lien), le backend
                l'exclut d'ailleurs du PUT profil. */}
            <Input
              id="account-email"
              type="email"
              value={owner.email}
              readOnly
              className="text-muted-foreground"
            />
            <FieldDescription>
              Identifiant de connexion — non modifiable pour l&apos;instant.
            </FieldDescription>
          </Field>

          <div>
            <LogoutButton />
          </div>
        </CardContent>
      </Card>

      {/* Aperçu de la suite du portail : l'espace animaux (contexte
          patients du backend) n'est pas encore implémenté. */}
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <PawPrint className="size-4" aria-hidden />
        Vos animaux et vos rendez-vous apparaîtront bientôt ici.
        <Badge variant="secondary">Bientôt</Badge>
      </p>
    </main>
  );
}
