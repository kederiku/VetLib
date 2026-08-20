/**
 * Formulaire d'inscription d'un propriétaire d'animaux (onboarding B2C).
 *
 * Particularité : la soumission enchaîne DEUX appels API.
 * 1. POST /api/v1/owner/auth/register crée le compte propriétaire, mais
 *    NE pose AUCUN cookie (201 sans session) ;
 * 2. POST /api/v1/owner/auth/login avec l'email et le mot de passe qui
 *    viennent d'être saisis ouvre la session dans la foulée.
 * L'utilisateur vit donc "je crée mon compte et j'arrive sur ma fiche"
 * sans repasser par l'écran de connexion.
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
import {
  getGetCurrentOwnerQueryKey,
  useOwnerLogin,
  useRegisterOwner,
} from "@/lib/api/generated/owner-auth/owner-auth";
import { applyServerErrors } from "@/lib/auth/server-errors";
import {
  registerOwnerSchema,
  type RegisterOwnerFormValues,
} from "@/lib/auth/schemas";

// Champs que CE formulaire affiche : une erreur 422 sur un autre champ
// partirait dans le bandeau global (voir applyServerErrors).
const KNOWN_FIELDS = [
  "first_name",
  "last_name",
  "email",
  "phone",
  "password",
] as const;

export function RegisterOwnerForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  // TError = ApiError sur les deux mutations : le mutator normalise
  // toutes les erreurs HTTP dans cette classe.
  const registerMutation = useRegisterOwner<ApiError>();
  const loginMutation = useOwnerLogin<ApiError>();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterOwnerFormValues>({
    resolver: zodResolver(registerOwnerSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      password: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    // Étape 1 : création du compte. En cas d'échec (email déjà pris,
    // 422...), on affiche les erreurs et on s'arrête là.
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
      // le cache de /me, la fiche s'affiche sans requête de plus.
      queryClient.setQueryData(getGetCurrentOwnerQueryKey(), res);
      router.push("/account");
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
        <CardTitle>Créer mon compte</CardTitle>
        <CardDescription>
          Votre espace personnel pour prendre rendez-vous et suivre la santé
          de vos animaux.
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
                placeholder="vous@exemple.fr"
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
              Créer mon compte
            </Button>

            {/* nativeButton={false} : le Button est rendu comme un <Link>
                Next.js via la prop render (Base UI n'a pas asChild). */}
            <p className="text-center text-sm text-muted-foreground">
              Déjà un compte ?{" "}
              <Button
                variant="link"
                className="h-auto p-0"
                nativeButton={false}
                render={<Link href="/login" />}
              >
                Se connecter
              </Button>
            </p>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
