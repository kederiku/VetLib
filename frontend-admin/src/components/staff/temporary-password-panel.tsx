/**
 * Remise du mot de passe temporaire d'un compte du personnel.
 *
 * Ce panneau est le SEUL endroit du produit où ce secret est lisible : le
 * backend le génère, le hache, et aucune route ne permet de le relire. D'où
 * trois partis pris qui ne sont pas décoratifs :
 *
 * - un avertissement en variante destructive, parce que fermer trop vite
 *   coûte un aller-retour avec le gérant et une réinitialisation ;
 * - un bouton « copier » plutôt qu'un simple champ, parce qu'une phrase de
 *   passe de cinq mots se recopie mal à la main ;
 * - une police à chasse fixe, pour que les tirets et les mots se distinguent
 *   quand on la dicte au téléphone.
 *
 * Les deux dialogues qui créent un compte (nouvelle clinique, nouveau membre)
 * l'utilisent tels quels : dupliquer cet écran garantirait qu'une des deux
 * copies perde un jour son avertissement.
 */
"use client";

import { CopyIcon } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { AdminStaffCreatedResponse } from "@/lib/api/generated/vetoLibAPI.schemas";

export function TemporaryPasswordPanel({
  compte,
  prefixeId,
}: {
  compte: AdminStaffCreatedResponse;
  /** Préfixe des id : deux dialogues peuvent coexister dans le DOM. */
  prefixeId: string;
}) {
  const copier = () => {
    void navigator.clipboard
      .writeText(compte.temporary_password)
      .then(() => toast.success("Mot de passe copié"))
      // Le presse-papiers peut être refusé (contexte non sécurisé,
      // permission navigateur) : on le dit, l'utilisateur peut toujours
      // sélectionner le champ à la main.
      .catch(() => toast.error("Copie impossible : sélectionnez le champ."));
  };

  return (
    <>
      <Alert variant="destructive">
        <AlertTitle>Ce mot de passe ne sera plus affiché</AlertTitle>
        <AlertDescription>
          Il n&apos;est stocké nulle part en clair et aucune page ne permet de
          le retrouver. Son titulaire pourra le changer depuis son espace.
        </AlertDescription>
      </Alert>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${prefixeId}-identifiant`}>
            Identifiant
          </FieldLabel>
          <Input
            id={`${prefixeId}-identifiant`}
            value={compte.email}
            readOnly
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${prefixeId}-mot-de-passe`}>
            Mot de passe temporaire
          </FieldLabel>
          <div className="flex items-center gap-2">
            <Input
              id={`${prefixeId}-mot-de-passe`}
              value={compte.temporary_password}
              readOnly
              className="font-mono"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Copier le mot de passe"
              onClick={copier}
            >
              <CopyIcon aria-hidden />
            </Button>
          </div>
        </Field>
      </FieldGroup>
    </>
  );
}
