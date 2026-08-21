/**
 * Étape 2 du parcours d'inscription : l'adresse postale.
 *
 * Entièrement FACULTATIVE : « Passer cette étape » n'envoie aucune requête.
 * Le compte existe déjà (créé à l'étape 1), rien n'est perdu si la personne
 * l'ignore — elle pourra compléter sa fiche depuis /mon-compte.
 *
 * Aucun endpoint dédié à l'onboarding : on réutilise PUT /owner/profile, qui
 * est un REMPLACEMENT COMPLET de la fiche. D'où les champs relus dans le cache
 * de /me (prénom, nom, téléphone, préférences) et renvoyés tels quels : les
 * omettre les effacerait.
 *
 * L'adresse obéit à la règle TOUT-OU-RIEN du backend (soit `null`, soit un
 * bloc complet). Le schéma zod partagé avec la fiche profil s'en charge :
 * adresse vide = valide, adresse entamée = ligne 1, code postal et ville
 * exigés.
 */
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { ApiError } from "@/lib/api/errors";
import { getGetCurrentOwnerQueryKey } from "@/lib/api/generated/owner-auth/owner-auth";
import { useUpdateOwnerProfile } from "@/lib/api/generated/owner-profile/owner-profile";
import { applyServerErrors } from "@/lib/auth/server-errors";
import {
  onboardingAddressSchema,
  type OnboardingAddressFormValues,
} from "@/lib/auth/schemas";
import { useCurrentUser } from "@/lib/auth/use-current-user";

// Le portail cible la France : le pays n'est pas un champ du formulaire,
// il part en constante dans chaque adresse envoyée au backend.
const COUNTRY_FR = "FR";

// Ce formulaire n'affiche que des champs d'adresse, et le backend les
// localise sous loc = ["body", "address", ...] : aucun nom de champ "plat"
// à reconnaître, tout part donc dans le bandeau global (voir
// applyServerErrors). Un 422 sur l'adresse ici signalerait de toute façon un
// désaccord entre le schéma zod et Pydantic, pas une faute de saisie.
const KNOWN_FIELDS = [] as const;

interface StepAddressProps {
  /** Passage à l'étape suivante (adresse enregistrée ou étape sautée). */
  onDone: () => void;
}

export function StepAddress({ onDone }: StepAddressProps) {
  const queryClient = useQueryClient();
  const { data: owner } = useCurrentUser();
  const updateMutation = useUpdateOwnerProfile<ApiError>();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingAddressFormValues>({
    resolver: zodResolver(onboardingAddressSchema),
    // values (et pas seulement defaultValues) : un retour depuis l'étape 3
    // retrouve l'adresse déjà enregistrée, relue du cache de /me.
    values: {
      line1: owner?.address?.line1 ?? "",
      line2: owner?.address?.line2 ?? "",
      postal_code: owner?.address?.postal_code ?? "",
      city: owner?.address?.city ?? "",
    },
    resetOptions: { keepDirtyValues: true },
  });

  const onSubmit = handleSubmit(async (values) => {
    // Le superRefine du schéma garantit qu'ici l'adresse est soit
    // entièrement vide, soit complète : line1 suffit comme sentinelle.
    const hasAddress = values.line1 !== "";

    // Adresse laissée vide : rien à écrire, on avance. Envoyer un PUT qui ne
    // change rien coûterait un aller-retour pour le même résultat.
    if (!hasAddress) {
      onDone();
      return;
    }

    try {
      const res = await updateMutation.mutateAsync({
        data: {
          // Remplacement complet : les champs déjà connus repartent tels
          // quels, sous peine d'être effacés.
          first_name: owner?.first_name ?? "",
          last_name: owner?.last_name ?? "",
          phone: owner?.phone ?? null,
          address: {
            line1: values.line1,
            line2: values.line2 || null,
            postal_code: values.postal_code,
            city: values.city,
            country: COUNTRY_FR,
          },
          notification_preferences: owner?.notification_preferences ?? {
            email: true,
            sms: false,
          },
        },
      });

      // La réponse du PUT est le OwnerResponse à jour : on remplace
      // directement l'entrée de cache de /me, comme le fait ProfileForm.
      queryClient.setQueryData(getGetCurrentOwnerQueryKey(), res);
      onDone();
    } catch (error) {
      applyServerErrors(error, setError, KNOWN_FIELDS);
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Votre adresse</CardTitle>
        <CardDescription>
          Facultative. Elle permet aux cliniques de vous situer et figurera sur
          vos futures factures.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            {errors.root?.server && (
              <Alert variant="destructive">
                <AlertTitle>{errors.root.server.message}</AlertTitle>
              </Alert>
            )}

            <Field data-invalid={!!errors.line1}>
              <FieldLabel htmlFor="onboarding-address-line1">
                Adresse (ligne 1)
              </FieldLabel>
              <Input
                id="onboarding-address-line1"
                type="text"
                autoComplete="address-line1"
                placeholder="12 rue des Lilas"
                aria-invalid={!!errors.line1}
                {...register("line1")}
              />
              <FieldError errors={[errors.line1]} />
            </Field>

            <Field data-invalid={!!errors.line2}>
              <FieldLabel htmlFor="onboarding-address-line2">
                Complément{" "}
                <span className="font-normal text-muted-foreground">
                  (optionnel)
                </span>
              </FieldLabel>
              <Input
                id="onboarding-address-line2"
                type="text"
                autoComplete="address-line2"
                placeholder="Bâtiment B, 3e étage"
                aria-invalid={!!errors.line2}
                {...register("line2")}
              />
              <FieldError errors={[errors.line2]} />
            </Field>

            <div className="grid gap-6 sm:grid-cols-[10rem_1fr]">
              <Field data-invalid={!!errors.postal_code}>
                <FieldLabel htmlFor="onboarding-address-postal-code">
                  Code postal
                </FieldLabel>
                <Input
                  id="onboarding-address-postal-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder="75011"
                  aria-invalid={!!errors.postal_code}
                  {...register("postal_code")}
                />
                <FieldError errors={[errors.postal_code]} />
              </Field>

              <Field data-invalid={!!errors.city}>
                <FieldLabel htmlFor="onboarding-address-city">Ville</FieldLabel>
                <Input
                  id="onboarding-address-city"
                  type="text"
                  autoComplete="address-level2"
                  placeholder="Paris"
                  aria-invalid={!!errors.city}
                  {...register("city")}
                />
                <FieldError errors={[errors.city]} />
              </Field>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Spinner data-icon="inline-start" />}
                Continuer
              </Button>
              {/* type="button" : ne déclenche NI la soumission ni la
                  validation zod — on saute une étape facultative, une
                  adresse à moitié saisie ne doit pas bloquer. */}
              <Button
                type="button"
                variant="ghost"
                disabled={isSubmitting}
                onClick={onDone}
              >
                Passer cette étape
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
