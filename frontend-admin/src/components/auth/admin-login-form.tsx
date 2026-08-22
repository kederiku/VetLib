/**
 * Formulaire de connexion au back-office plateforme.
 *
 * Même assemblage que les deux portails : react-hook-form pour l'état des
 * champs, zodResolver pour la validation, le hook Orval useAdminLogin pour
 * l'appel, applyServerErrors pour replacer les erreurs API au bon endroit.
 * Au succès, le backend a posé les cookies HttpOnly : le JavaScript n'a
 * jamais vu les jetons.
 *
 * Deux absences volontaires par rapport aux portails :
 * - AUCUN lien « Pas encore de compte ? » — il n'existe pas d'inscription
 *   dans cet espace, et il ne doit pas en exister ;
 * - AUCUN lien « Mot de passe oublié ? » — le backend n'offre pas de flux de
 *   réinitialisation. Afficher un lien mort serait pire que de ne rien
 *   afficher ; une phrase qui dit OÙ ALLER vaut mieux qu'un silence.
 */
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";

import { PasswordInput } from "@/components/auth/password-input";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { ApiError } from "@/lib/api/errors";
import {
  getGetCurrentAdminQueryKey,
  useAdminLogin,
} from "@/lib/api/generated/admin-auth/admin-auth";
import { loginSchema, type LoginFormValues } from "@/lib/auth/schemas";
import { applyServerErrors } from "@/lib/auth/server-errors";
import { setSessionHint } from "@/lib/auth/session-hint";

export function AdminLoginForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  // TError = ApiError : le mutator jette toujours un ApiError normalisé, on
  // le déclare au hook pour que le catch soit correctement typé.
  const loginMutation = useAdminLogin<ApiError>();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      // mutateAsync (et non mutate) : on veut attendre la réponse pour que
      // isSubmitting reste vrai pendant l'appel et que le catch reçoive
      // l'erreur.
      const res = await loginMutation.mutateAsync({ data: values });
      // La réponse EST déjà le profil : on la range dans le cache de /me,
      // ce qui évite un GET supplémentaire au montage du tableau de bord.
      queryClient.setQueryData(getGetCurrentAdminQueryKey(), res);
      setSessionHint();
      router.push("/tableau-de-bord");
    } catch (error) {
      applyServerErrors(error, setError, ["email", "password"]);
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connexion</CardTitle>
        <CardDescription>
          Console d&apos;administration VetoLib. Accès réservé.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* noValidate : on désactive les bulles natives du navigateur, zod et
            FieldError s'occupent de tout (messages FR homogènes). */}
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            {/* Bandeau d'erreur globale : identifiants incorrects, accès
                révoqué, trop de tentatives, panne réseau. */}
            {errors.root?.server && (
              <Alert variant="destructive">
                <AlertTitle>{errors.root.server.message}</AlertTitle>
              </Alert>
            )}

            <Field data-invalid={!!errors.email}>
              <FieldLabel htmlFor="login-email">Email</FieldLabel>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="prenom.nom@exemple.fr"
                aria-invalid={!!errors.email}
                {...register("email")}
              />
              <FieldError errors={[errors.email]} />
            </Field>

            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="login-password">Mot de passe</FieldLabel>
              <PasswordInput
                id="login-password"
                // current-password (et non new-password) : indique au
                // navigateur qu'il s'agit d'un mot de passe EXISTANT.
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                {...register("password")}
              />
              <FieldError errors={[errors.password]} />
            </Field>

            {/* disabled pendant la soumission : empêche le double envoi. */}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner data-icon="inline-start" />}
              Se connecter
            </Button>

            {/* Ce qui remplace « Pas encore de compte ? » : dire où aller.
                Aucun lien sortant ni adresse en dur -- le dépôt est public. */}
            <p className="text-center text-xs text-muted-foreground">
              Les accès administrateurs sont créés directement en base par
              l&apos;équipe technique. En cas de perte de mot de passe,
              contactez un autre administrateur.
            </p>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
