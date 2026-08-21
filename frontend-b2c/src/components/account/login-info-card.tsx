/**
 * Carte « Connexion » : l'email du compte, en lecture seule.
 *
 * Elle DIT ce qui n'existe pas encore. Sans cette phrase, quelqu'un qui
 * cherche à changer son mot de passe fouillerait les quatre cartes de la
 * page avant de conclure — à tort — qu'il a mal cherché. Annoncer
 * l'absence coûte une ligne et évite cette perte de temps.
 *
 * La déconnexion n'est plus ici : elle vit dans le menu du compte, au
 * header, où elle est accessible depuis n'importe quel écran.
 */
"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { OwnerResponse } from "@/lib/api/generated/vetoLibAPI.schemas";

export function LoginInfoCard({ owner }: { owner: OwnerResponse }) {
  return (
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
              L'email est l'identifiant du compte : son changement exigera
              un flux dédié (vérification par lien), le backend l'exclut
              d'ailleurs du PUT profil. */}
          <Input
            id="account-email"
            type="email"
            value={owner.email}
            readOnly
            className="text-muted-foreground"
          />
          <FieldDescription>
            Identifiant de connexion. La modification de l&apos;email et du mot
            de passe arrivera prochainement.
          </FieldDescription>
        </Field>
      </CardContent>
    </Card>
  );
}
