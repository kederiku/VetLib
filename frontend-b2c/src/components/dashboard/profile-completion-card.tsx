/**
 * Invite « Complétez votre profil », affichée UNIQUEMENT si quelque
 * chose manque.
 *
 * L'inscription en trois étapes laisse volontairement passer l'adresse
 * et le téléphone : un compte parfaitement utilisable peut donc rester
 * incomplet indéfiniment, sans que rien ne le rappelle. Cette carte le
 * rappelle — et DISPARAÎT dès que c'est rempli, ce qui l'empêche de
 * devenir un décor que l'oeil apprend à ignorer.
 *
 * Elle ne rend rien tant que la session n'est pas résolue : afficher
 * « il manque votre téléphone » avant de savoir s'il manque vraiment
 * serait un faux reproche.
 */
"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CHAMP_LABELS,
  missingProfileDescription,
  missingProfileFields,
} from "@/lib/account/profile-completion";
import { useCurrentUser } from "@/lib/auth/use-current-user";

export function ProfileCompletionCard() {
  const { data: owner } = useCurrentUser();
  const manquants = missingProfileFields(owner);

  if (manquants.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Complétez votre profil</CardTitle>
        <CardDescription>
          {missingProfileDescription(manquants)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-3">
        <ul className="flex flex-wrap gap-2">
          {manquants.map((champ) => (
            <li key={champ}>
              <Badge variant="outline">{CHAMP_LABELS[champ]}</Badge>
            </li>
          ))}
        </ul>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/mon-compte" />}
        >
          Compléter mon profil
        </Button>
      </CardContent>
    </Card>
  );
}
