/**
 * Carte « Informations personnelles » : prénom, nom, téléphone.
 *
 * Une des trois cartes indépendantes de « Mon compte ». Elle n'envoie
 * que SES champs ; la recomposition de la fiche complète attendue par le
 * PUT se fait dans useSaveOwnerProfile (voir sa docstring pour les deux
 * règles à ne pas enfreindre).
 *
 * `values:` de react-hook-form (et non defaultValues seuls) : le
 * formulaire se resynchronise quand la query /me arrive ou change --
 * defaultValues n'est lu qu'AU PREMIER montage, un formulaire monté
 * avant la réponse resterait vide.
 */
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { OwnerResponse } from "@/lib/api/generated/vetoLibAPI.schemas";
import type { SaveOwnerProfile } from "@/lib/account/use-save-owner-profile";
import {
  personalInfoSchema,
  type PersonalInfoFormValues,
} from "@/lib/auth/schemas";
import { applyServerErrors } from "@/lib/auth/server-errors";

// Champs "plats" que ce formulaire affiche : une erreur 422 sur un autre
// champ part dans le bandeau global (voir applyServerErrors).
const KNOWN_FIELDS = ["first_name", "last_name", "phone"] as const;

export function PersonalInfoForm({
  owner,
  save,
  isSaving,
}: { owner: OwnerResponse } & SaveOwnerProfile) {
  // Un <input> ne sait pas afficher null : chaque champ absent devient
  // "", et l'envoi fait la conversion inverse.
  const values = useMemo<PersonalInfoFormValues>(
    () => ({
      first_name: owner.first_name,
      last_name: owner.last_name,
      phone: owner.phone ?? "",
    }),
    [owner],
  );

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PersonalInfoFormValues>({
    resolver: zodResolver(personalInfoSchema),
    values,
    // Si une resynchronisation survient PENDANT une saisie (refetch de
    // /me en arrière-plan), on garde les champs déjà modifiés.
    resetOptions: { keepDirtyValues: true },
  });

  const onSubmit = handleSubmit(async (valeurs) => {
    try {
      await save({
        first_name: valeurs.first_name,
        last_name: valeurs.last_name,
        // "" -> null : phone est nullable côté backend, une chaîne vide
        // échouerait sa validation.
        phone: valeurs.phone || null,
      });
      toast.success("Informations enregistrées");
    } catch (error) {
      applyServerErrors(error, setError, KNOWN_FIELDS);
    }
  });

  const enCours = isSubmitting || isSaving;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Informations personnelles</CardTitle>
        <CardDescription>
          Le nom sous lequel les cliniques vous identifient.
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
          <FieldGroup>
            {errors.root?.server && (
              <Alert variant="destructive">
                <AlertTitle>{errors.root.server.message}</AlertTitle>
              </Alert>
            )}

            <div className="grid gap-6 sm:grid-cols-2">
              <Field data-invalid={!!errors.first_name}>
                <FieldLabel htmlFor="profile-first-name">Prénom</FieldLabel>
                <Input
                  id="profile-first-name"
                  type="text"
                  autoComplete="given-name"
                  aria-invalid={!!errors.first_name}
                  {...register("first_name")}
                />
                <FieldError errors={[errors.first_name]} />
              </Field>

              <Field data-invalid={!!errors.last_name}>
                <FieldLabel htmlFor="profile-last-name">Nom</FieldLabel>
                <Input
                  id="profile-last-name"
                  type="text"
                  autoComplete="family-name"
                  aria-invalid={!!errors.last_name}
                  {...register("last_name")}
                />
                <FieldError errors={[errors.last_name]} />
              </Field>
            </div>

            <Field data-invalid={!!errors.phone}>
              <FieldLabel htmlFor="profile-phone">
                Téléphone{" "}
                <span className="text-muted-foreground">(optionnel)</span>
              </FieldLabel>
              <Input
                id="profile-phone"
                type="tel"
                autoComplete="tel"
                aria-invalid={!!errors.phone}
                {...register("phone")}
              />
              <FieldDescription>
                Utilisé par la clinique en cas d&apos;imprévu sur votre
                rendez-vous.
              </FieldDescription>
              <FieldError errors={[errors.phone]} />
            </Field>
          </FieldGroup>
        </CardContent>

        <CardFooter>
          {/* disabled tant qu'un enregistrement est en vol, y compris
              celui d'une AUTRE carte : deux PUT concurrents partiraient
              d'une meme base pre-mutation, le second ecraserait le
              premier. */}
          <Button type="submit" disabled={enCours}>
            {enCours && <Spinner data-icon="inline-start" />}
            Enregistrer
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
