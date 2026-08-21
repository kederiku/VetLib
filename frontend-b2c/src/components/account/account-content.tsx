/**
 * Contenu de la page /mon-compte : la fiche du propriétaire connecté.
 *
 * Deux blocs seulement depuis la refonte : le formulaire de profil et
 * les informations de connexion. L'aperçu des rendez-vous est parti au
 * tableau de bord (sa place), et la déconnexion au menu du compte dans
 * le header — elle n'a plus à occuper un pied de page permanent.
 *
 * Colonne étroite (width="narrow") : ce sont des formulaires, une
 * colonne resserrée reste plus lisible que la pleine largeur.
 */
"use client";

import { ProfileForm } from "@/components/account/profile-form";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
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
    <PageContainer width="narrow">
      <PageHeader
        title="Mon compte"
        description="Vos coordonnées, votre adresse et vos préférences de rappels."
      />

      {/* Le formulaire complet de la fiche propriétaire. */}
      <ProfileForm />

      {/* Les informations de connexion, hors formulaire. */}
      <Card>
        <CardHeader>
          <CardTitle>Connexion</CardTitle>
          <CardDescription>Vos informations de connexion.</CardDescription>
        </CardHeader>
        <CardContent>
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
              Identifiant de connexion. La modification de l&apos;email et du
              mot de passe arrivera prochainement.
            </FieldDescription>
          </Field>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
