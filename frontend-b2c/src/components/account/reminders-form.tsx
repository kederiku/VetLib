/**
 * Carte « Rappels » : les canaux de notification du propriétaire.
 *
 * Bouton « Enregistrer » explicite et PAS d'enregistrement automatique
 * au clic. L'auto-save sur une case à cocher est séduisant, mais un
 * échec réseau laisserait la case visuellement cochée alors que le
 * serveur dit le contraire : il faudrait alors la décocher toute seule,
 * une animation qui déroute et donne l'impression d'un bug. Trois
 * cartes, trois boutons identiques : un seul modèle mental.
 *
 * CHECKBOX CONTROLEES : la Checkbox Base UI n'expose pas de value
 * lisible par register() ; les deux cases passent donc par <Controller>
 * (checked / onCheckedChange).
 */
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import type { OwnerResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import type { SaveOwnerProfile } from "@/lib/account/use-save-owner-profile";
import { remindersSchema, type RemindersFormValues } from "@/lib/auth/schemas";
import { applyServerErrors } from "@/lib/auth/server-errors";

// Aucun champ "plat" : une 422 sur les préférences part dans le bandeau
// global plutôt que sous une case à cocher, où elle serait illisible.
const KNOWN_FIELDS = [] as const;

const CANAUX = [
  {
    cle: "email",
    id: "profile-notify-email",
    libelle: "Par email",
  },
  {
    cle: "sms",
    id: "profile-notify-sms",
    libelle: "Par SMS",
  },
] as const;

export function RemindersForm({
  owner,
  save,
  isSaving,
}: { owner: OwnerResponse } & SaveOwnerProfile) {
  const values = useMemo<RemindersFormValues>(
    () => ({
      notification_preferences: {
        // ?? : miroir des défauts du domaine backend (email opt-in par
        // défaut, SMS non) au cas où l'API omettrait un canal.
        email: owner.notification_preferences.email ?? true,
        sms: owner.notification_preferences.sms ?? false,
      },
    }),
    [owner],
  );

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RemindersFormValues>({
    resolver: zodResolver(remindersSchema),
    values,
    resetOptions: { keepDirtyValues: true },
  });

  const onSubmit = handleSubmit(async (valeurs) => {
    try {
      await save({
        notification_preferences: valeurs.notification_preferences,
      });
      toast.success("Préférences enregistrées");
    } catch (error) {
      applyServerErrors(error, setError, KNOWN_FIELDS);
    }
  });

  const enCours = isSubmitting || isSaving;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rappels</CardTitle>
        <CardDescription>
          Comment souhaitez-vous être prévenu à l&apos;approche d&apos;un
          rendez-vous ?
        </CardDescription>
      </CardHeader>

      {/* noValidate : validation confiee a zod, pas aux bulles natives.

          flex flex-col gap-(--card-spacing) : la Card est elle-meme un
          flex-col dont le gap espace en-tete, contenu et pied. Ce <form>
          s'intercale entre elle et ses sections : sans reprendre sa mise
          en page, il redevient un simple bloc et le pied se retrouve
          COLLE au contenu (0 px au lieu de 24). Le piege ne se voit que
          sur les cartes qui ont a la fois un CardContent et un
          CardFooter -- c'est-a-dire les trois formulaires de cet ecran. */}
      <form
        onSubmit={onSubmit}
        noValidate
        className="flex flex-col gap-(--card-spacing)"
      >
        <CardContent>
          <FieldGroup className="gap-3">
            {errors.root?.server && (
              <Alert variant="destructive">
                <AlertTitle>{errors.root.server.message}</AlertTitle>
              </Alert>
            )}

            {CANAUX.map((canal) => (
              <Field key={canal.cle} orientation="horizontal">
                <Controller
                  control={control}
                  name={`notification_preferences.${canal.cle}`}
                  render={({ field }) => (
                    <Checkbox
                      id={canal.id}
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked)}
                    />
                  )}
                />
                {/* htmlFor -> id de la case : cliquer le libellé la coche. */}
                <FieldLabel htmlFor={canal.id} className="font-normal">
                  {canal.libelle}
                </FieldLabel>
              </Field>
            ))}
          </FieldGroup>
        </CardContent>

        <CardFooter>
          <Button type="submit" disabled={enCours}>
            {enCours && <Spinner data-icon="inline-start" />}
            Enregistrer
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
