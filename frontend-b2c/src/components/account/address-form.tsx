/**
 * Carte « Adresse » de « Mon compte ».
 *
 * Deux mécanismes à connaître :
 *
 * 1. ADRESSE TOUT-OU-RIEN : le backend attend `address: null` s'il n'y a
 *    pas d'adresse, JAMAIS un objet aux champs vides (422). Le schéma
 *    zod garantit qu'une adresse entamée est complète, et l'envoi
 *    traduit « tout vide » en null.
 * 2. EFFACEMENT : le bouton « Effacer l'adresse » ne fait que vider les
 *    champs du formulaire ; c'est « Enregistrer » qui applique. Cela
 *    évite une seconde route d'écriture et réutilise exactement la règle
 *    tout-ou-rien déjà écrite -- une adresse entièrement vide vaut null.
 *
 * Le formulaire n'envoie que SON champ ; la fiche complète attendue par
 * le PUT est recomposée par useSaveOwnerProfile.
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
  profileAddressSchema,
  type ProfileAddressFormValues,
} from "@/lib/auth/schemas";
import { applyServerErrors } from "@/lib/auth/server-errors";

// Le portail cible la France : le pays n'est pas un champ du formulaire,
// il part en constante dans chaque adresse envoyée au backend.
const COUNTRY_FR = "FR";

const KNOWN_FIELDS = ["line1", "line2", "postal_code", "city"] as const;

const VIDE: ProfileAddressFormValues = {
  line1: "",
  line2: "",
  postal_code: "",
  city: "",
};

export function AddressForm({
  owner,
  save,
  isSaving,
}: { owner: OwnerResponse } & SaveOwnerProfile) {
  const values = useMemo<ProfileAddressFormValues>(
    () => ({
      line1: owner.address?.line1 ?? "",
      line2: owner.address?.line2 ?? "",
      postal_code: owner.address?.postal_code ?? "",
      city: owner.address?.city ?? "",
    }),
    [owner],
  );

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProfileAddressFormValues>({
    resolver: zodResolver(profileAddressSchema),
    values,
    resetOptions: { keepDirtyValues: true },
  });

  const onSubmit = handleSubmit(async (valeurs) => {
    // Le superRefine du schéma garantit qu'ici l'adresse est soit
    // entièrement vide, soit complète : line1 suffit comme sentinelle.
    const aUneAdresse = valeurs.line1 !== "";
    try {
      await save({
        address: aUneAdresse
          ? {
              line1: valeurs.line1,
              line2: valeurs.line2 || null,
              postal_code: valeurs.postal_code,
              city: valeurs.city,
              country: COUNTRY_FR,
            }
          : null,
      });
      toast.success(
        aUneAdresse ? "Adresse enregistrée" : "Adresse effacée",
      );
    } catch (error) {
      applyServerErrors(error, setError, KNOWN_FIELDS);
    }
  });

  const enCours = isSubmitting || isSaving;
  const aUneAdresseEnregistree = owner.address !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adresse</CardTitle>
        <CardDescription>
          Facultative. Si vous la renseignez, l&apos;adresse, le code postal
          et la ville sont requis.
        </CardDescription>
      </CardHeader>

      <form onSubmit={onSubmit} noValidate>
        <CardContent>
          <FieldGroup>
            {errors.root?.server && (
              <Alert variant="destructive">
                <AlertTitle>{errors.root.server.message}</AlertTitle>
              </Alert>
            )}

            <Field data-invalid={!!errors.line1}>
              <FieldLabel htmlFor="profile-address-line1">Adresse</FieldLabel>
              <Input
                id="profile-address-line1"
                type="text"
                autoComplete="address-line1"
                aria-invalid={!!errors.line1}
                {...register("line1")}
              />
              <FieldError errors={[errors.line1]} />
            </Field>

            <Field data-invalid={!!errors.line2}>
              <FieldLabel htmlFor="profile-address-line2">
                Complément{" "}
                <span className="text-muted-foreground">(optionnel)</span>
              </FieldLabel>
              <Input
                id="profile-address-line2"
                type="text"
                autoComplete="address-line2"
                aria-invalid={!!errors.line2}
                {...register("line2")}
              />
              <FieldError errors={[errors.line2]} />
            </Field>

            <div className="grid gap-6 sm:grid-cols-[10rem_1fr]">
              <Field data-invalid={!!errors.postal_code}>
                <FieldLabel htmlFor="profile-address-postal-code">
                  Code postal
                </FieldLabel>
                <Input
                  id="profile-address-postal-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  aria-invalid={!!errors.postal_code}
                  {...register("postal_code")}
                />
                <FieldError errors={[errors.postal_code]} />
              </Field>

              <Field data-invalid={!!errors.city}>
                <FieldLabel htmlFor="profile-address-city">Ville</FieldLabel>
                <Input
                  id="profile-address-city"
                  type="text"
                  autoComplete="address-level2"
                  aria-invalid={!!errors.city}
                  {...register("city")}
                />
                <FieldError errors={[errors.city]} />
              </Field>
            </div>
          </FieldGroup>
        </CardContent>

        <CardFooter className="flex-wrap items-center gap-3">
          <Button type="submit" disabled={enCours}>
            {enCours && <Spinner data-icon="inline-start" />}
            Enregistrer
          </Button>
          {aUneAdresseEnregistree && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={enCours}
                onClick={() => reset(VIDE)}
              >
                Effacer l&apos;adresse
              </Button>
              <FieldDescription className="basis-full">
                « Effacer » vide les champs ; l&apos;adresse ne sera supprimée
                qu&apos;après enregistrement.
              </FieldDescription>
            </>
          )}
        </CardFooter>
      </form>
    </Card>
  );
}
