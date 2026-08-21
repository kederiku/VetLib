/**
 * Étape 1 du parcours d'inscription : la création du compte.
 *
 * C'est la SEULE étape obligatoire. À sa validation, deux appels s'enchaînent :
 * 1. POST /api/v1/owner/auth/register crée le compte propriétaire, mais
 *    NE pose AUCUN cookie (201 sans session) ;
 * 2. POST /api/v1/owner/auth/login avec l'email et le mot de passe qui
 *    viennent d'être saisis ouvre la session dans la foulée.
 * Les étapes 2 et 3 se déroulent ensuite CONNECTÉ, et écrivent chacune
 * immédiatement : quelqu'un qui abandonne en cours de route repart malgré tout
 * avec un compte utilisable.
 *
 * Pourquoi créer le compte si tôt : c'est ce qui permet d'annoncer « cette
 * adresse est déjà utilisée » dès la première étape, plutôt qu'après avoir
 * fait saisir une adresse postale et des animaux. L'alternative — vérifier la
 * disponibilité de l'email avant la création — exigerait un endpoint public
 * qui répond « ce compte existe » à qui le demande : exactement l'oracle
 * d'énumération que le reste de l'authentification s'attache à éviter.
 *
 * Le téléphone est REQUIS ici (la clinique doit pouvoir joindre le
 * propriétaire) alors qu'il reste nullable dans le contrat d'API : c'est une
 * règle de ce parcours, pas du backend. La fiche /mon-compte permet d'ailleurs de
 * l'effacer ensuite.
 */
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";

import { PasswordInput } from "@/components/auth/password-input";
import { PasswordStrengthHint } from "@/components/auth/password-strength-hint";
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

interface StepAccountProps {
  /** Appelé une fois le compte créé ET la session ouverte. */
  onCreated: () => void;
}

export function StepAccount({ onCreated }: StepAccountProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  // TError = ApiError sur les deux mutations : le mutator normalise
  // toutes les erreurs HTTP dans cette classe.
  const registerMutation = useRegisterOwner<ApiError>();
  const loginMutation = useOwnerLogin<ApiError>();

  const {
    register,
    control,
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
      password_confirmation: "",
    },
  });

  // useWatch (et non watch()) : abonnement déclaratif à la valeur du champ
  // mot de passe, pour alimenter l'indicateur de force pendant la frappe. Le
  // champ reste non contrôlé (register), on ne fait que l'OBSERVER.
  const passwordValue = useWatch({ control, name: "password" }) ?? "";

  const onSubmit = handleSubmit(async (values) => {
    // Étape 1 : création du compte. En cas d'échec (email déjà pris, mot de
    // passe compromis, 422...), on affiche les erreurs et on s'arrête là.
    try {
      await registerMutation.mutateAsync({
        data: {
          first_name: values.first_name,
          last_name: values.last_name,
          email: values.email,
          phone: values.phone,
          password: values.password,
          // password_confirmation n'est délibérément PAS envoyé : c'est un
          // garde-fou de saisie, le backend n'en a que faire.
        },
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
      // le cache de /me. Les étapes suivantes lisent ce cache pour
      // pré-remplir la fiche, sans requête de plus.
      queryClient.setQueryData(getGetCurrentOwnerQueryKey(), res);
      onCreated();
    } catch {
      // Cas très improbable (le compte vient d'être créé avec ces
      // identifiants) : le compte EXISTE mais la session n'a pas pu
      // s'ouvrir. On envoie l'utilisateur sur /login pour qu'il se
      // connecte manuellement, plutôt que de le laisser bloqué ici ou de
      // lui faire recommencer une inscription qui buterait sur un
      // « email déjà utilisé » incompréhensible.
      router.push("/login");
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Créer mon compte</CardTitle>
        <CardDescription>
          Votre espace personnel pour prendre rendez-vous et suivre la santé de
          vos animaux.
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

            <div className="grid gap-6 sm:grid-cols-2">
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
            </div>

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
              <FieldLabel htmlFor="register-phone">Téléphone</FieldLabel>
              <Input
                id="register-phone"
                type="tel"
                autoComplete="tel"
                placeholder="06 12 34 56 78"
                aria-invalid={!!errors.phone}
                {...register("phone")}
              />
              <FieldError errors={[errors.phone]} />
            </Field>

            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="register-password">Mot de passe</FieldLabel>
              <PasswordInput
                id="register-password"
                // new-password : le navigateur propose de GÉNÉRER un mot
                // de passe fort au lieu de remplir un mot de passe connu.
                autoComplete="new-password"
                aria-invalid={!!errors.password}
                {...register("password")}
              />
              {/* La politique est annoncée AVANT l'erreur : l'utilisateur
                  sait quoi taper du premier coup. */}
              <PasswordStrengthHint password={passwordValue} />
              <FieldError errors={[errors.password]} />
            </Field>

            <Field data-invalid={!!errors.password_confirmation}>
              <FieldLabel htmlFor="register-password-confirmation">
                Confirmer le mot de passe
              </FieldLabel>
              <PasswordInput
                id="register-password-confirmation"
                autoComplete="new-password"
                aria-invalid={!!errors.password_confirmation}
                {...register("password_confirmation")}
              />
              <FieldError errors={[errors.password_confirmation]} />
            </Field>

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner data-icon="inline-start" />}
              Continuer
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
