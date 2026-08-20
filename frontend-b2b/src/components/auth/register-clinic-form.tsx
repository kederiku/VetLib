/**
 * Formulaire d'inscription d'une clinique (onboarding B2B).
 *
 * Particularité : la soumission enchaîne DEUX appels API.
 * 1. POST /api/v1/clinics/register crée la clinique + son premier
 *    utilisateur (manager), mais NE pose AUCUN cookie (201 sans session) ;
 * 2. POST /api/v1/auth/login avec l'email et le mot de passe qui viennent
 *    d'être saisis ouvre la session dans la foulée.
 * L'utilisateur vit donc "je m'inscris et j'arrive sur mon tableau de
 * bord" sans repasser par l'écran de connexion.
 */
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { ApiError } from "@/lib/api/errors";
import { getGetCurrentUserQueryKey, useLogin } from "@/lib/api/generated/auth/auth";
import { useRegisterClinic } from "@/lib/api/generated/clinics/clinics";
import { applyServerErrors } from "@/lib/auth/server-errors";
import {
  registerClinicSchema,
  type RegisterClinicFormValues,
} from "@/lib/auth/schemas";

// Champs que CE formulaire affiche : une erreur 422 sur un autre champ
// partirait dans le bandeau global (voir applyServerErrors).
const KNOWN_FIELDS = [
  "clinic_name",
  "first_name",
  "last_name",
  "email",
  "phone",
  "password",
] as const;

export function RegisterClinicForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  // TError = ApiError sur les deux mutations : le mutator normalise
  // toutes les erreurs HTTP dans cette classe.
  const registerMutation = useRegisterClinic<ApiError>();
  const loginMutation = useLogin<ApiError>();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterClinicFormValues>({
    resolver: zodResolver(registerClinicSchema),
    defaultValues: {
      clinic_name: "",
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      password: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    // Étape 1 : création de la clinique. En cas d'échec (email déjà
    // pris, 422...), on affiche les erreurs et on s'arrête là.
    try {
      await registerMutation.mutateAsync({
        // phone est nullable côté backend : une chaîne vide (champ non
        // rempli) devient null, jamais "" (qui échouerait la validation).
        data: { ...values, phone: values.phone || null },
      });
    } catch (error) {
      applyServerErrors(error, setError, KNOWN_FIELDS);
      return;
    }

    // Étape 2 : connexion automatique avec les identifiants tout juste
    // créés, pour poser les cookies de session.
    try {
      const res = await loginMutation.mutateAsync({
        data: { email: values.email, password: values.password },
      });
      // Comme dans LoginForm : la réponse du login alimente directement
      // le cache de /me, le dashboard s'affiche sans requête de plus.
      queryClient.setQueryData(getGetCurrentUserQueryKey(), res);
      router.push("/dashboard");
    } catch {
      // Cas très improbable (le compte vient d'être créé avec ces
      // identifiants) : le compte EXISTE mais la session n'a pas pu
      // s'ouvrir. On envoie l'utilisateur sur /login pour qu'il se
      // connecte manuellement, plutôt que de le laisser bloqué ici.
      router.push("/login");
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inscrire ma clinique</CardTitle>
        <CardDescription>
          Créez l&apos;espace VetoLib Pro de votre clinique et votre compte
          gérant.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* noValidate : validation confiée à zod (messages FR homogènes),
            pas aux bulles natives du navigateur. */}
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            {errors.root?.server && (
              <Alert variant="destructive">
                <AlertTitle>{errors.root.server.message}</AlertTitle>
              </Alert>
            )}

            <Field data-invalid={!!errors.clinic_name}>
              <FieldLabel htmlFor="register-clinic-name">
                Nom de la clinique
              </FieldLabel>
              <Input
                id="register-clinic-name"
                type="text"
                autoComplete="organization"
                placeholder="Clinique des Trois Vallées"
                aria-invalid={!!errors.clinic_name}
                {...register("clinic_name")}
              />
              <FieldError errors={[errors.clinic_name]} />
            </Field>

            <Field data-invalid={!!errors.first_name}>
              <FieldLabel htmlFor="register-first-name">Prénom</FieldLabel>
              <Input
                id="register-first-name"
                type="text"
                autoComplete="given-name"
                aria-invalid={!!errors.first_name}
                {...register("first_name")}
              />
              <FieldError errors={[errors.first_name]} />
            </Field>

            <Field data-invalid={!!errors.last_name}>
              <FieldLabel htmlFor="register-last-name">Nom</FieldLabel>
              <Input
                id="register-last-name"
                type="text"
                autoComplete="family-name"
                aria-invalid={!!errors.last_name}
                {...register("last_name")}
              />
              <FieldError errors={[errors.last_name]} />
            </Field>

            <Field data-invalid={!!errors.email}>
              <FieldLabel htmlFor="register-email">Email</FieldLabel>
              <Input
                id="register-email"
                type="email"
                autoComplete="email"
                placeholder="vous@clinique.fr"
                aria-invalid={!!errors.email}
                {...register("email")}
              />
              <FieldError errors={[errors.email]} />
            </Field>

            <Field data-invalid={!!errors.phone}>
              <FieldLabel htmlFor="register-phone">
                Téléphone{" "}
                <span className="font-normal text-muted-foreground">
                  (optionnel)
                </span>
              </FieldLabel>
              <Input
                id="register-phone"
                type="tel"
                autoComplete="tel"
                aria-invalid={!!errors.phone}
                {...register("phone")}
              />
              <FieldError errors={[errors.phone]} />
            </Field>

            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="register-password">Mot de passe</FieldLabel>
              <Input
                id="register-password"
                type="password"
                // new-password : le navigateur propose de GÉNÉRER un mot
                // de passe fort au lieu de remplir un mot de passe connu.
                autoComplete="new-password"
                aria-invalid={!!errors.password}
                {...register("password")}
              />
              {/* La politique est annoncée AVANT l'erreur : l'utilisateur
                  sait quoi taper du premier coup. */}
              <FieldDescription>Au moins 12 caractères.</FieldDescription>
              <FieldError errors={[errors.password]} />
            </Field>

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner data-icon="inline-start" />}
              Créer ma clinique
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Déjà un compte ?{" "}
              <Button variant="link" className="h-auto p-0" nativeButton={false} render={<Link href="/login" />}>
                Se connecter
              </Button>
            </p>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
