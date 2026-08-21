/**
 * Formulaire de connexion au portail B2B.
 *
 * Assemblage type de tous les futurs formulaires du projet :
 * - react-hook-form gère l'état des champs (non contrôlés = performant) ;
 * - zodResolver branche la validation du loginSchema (messages FR) ;
 * - le hook Orval useLogin exécute l'appel POST /api/v1/auth/login ;
 * - applyServerErrors replace les erreurs API sous les bons champs.
 * Au succès, le backend a posé les cookies HttpOnly : le navigateur
 * détient la session, le JS n'a jamais vu les tokens.
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { PasswordInput } from "@/components/auth/password-input";
import type { ApiError } from "@/lib/api/errors";
import { getGetCurrentUserQueryKey, useLogin } from "@/lib/api/generated/auth/auth";
import { applyServerErrors } from "@/lib/auth/server-errors";
import { loginSchema, type LoginFormValues } from "@/lib/auth/schemas";
import { setSessionHint } from "@/lib/auth/session-hint";

export function LoginForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  // TError = ApiError : le mutator jette toujours un ApiError normalisé,
  // on le déclare au hook pour que le catch soit correctement typé.
  const loginMutation = useLogin<ApiError>();

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
      // mutateAsync (et non mutate) : on veut await la réponse pour que
      // isSubmitting reste vrai pendant tout l'appel et que le catch
      // ci-dessous récupère l'erreur.
      const res = await loginMutation.mutateAsync({ data: values });
      // Le login renvoie déjà le UserResponse : on le range directement
      // dans le cache de la query /me. Ainsi le dashboard s'affiche
      // instantanément, sans refaire un GET /me au montage.
      queryClient.setQueryData(getGetCurrentUserQueryKey(), res);
      // Indice de session localStorage : le prochain passage sur /login
      // saura qu'une session existe probablement (voir session-hint.ts).
      setSessionHint();
      router.push("/dashboard");
    } catch (error) {
      // Erreur API (401 identifiants, 422, panne réseau...) : on la
      // traduit en messages FR posés sur les champs ou en bandeau global.
      applyServerErrors(error, setError, ["email", "password"]);
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connexion</CardTitle>
        <CardDescription>
          Accédez à l&apos;espace de gestion de votre clinique.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* noValidate : on désactive les bulles de validation natives du
            navigateur, zod + FieldError se chargent de tout (messages FR
            homogènes au lieu des textes du navigateur). */}
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            {/* Bandeau d'erreur globale (root.server) : identifiants
                incorrects, compte désactivé, panne réseau... */}
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
                // autoComplete : indice pour le gestionnaire de mots de
                // passe du navigateur (proposer l'identifiant enregistré).
                autoComplete="email"
                placeholder="vous@clinique.fr"
                aria-invalid={!!errors.email}
                {...register("email")}
              />
              <FieldError errors={[errors.email]} />
            </Field>

            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="login-password">Mot de passe</FieldLabel>
              <PasswordInput
                id="login-password"
                // current-password (vs new-password) : indique au
                // navigateur qu'il s'agit d'un mot de passe EXISTANT.
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                {...register("password")}
              />
              {/* Pas de lien "mot de passe oublié" : c'est VOLONTAIRE,
                  aucun endpoint de réinitialisation n'existe côté
                  backend. Afficher un lien mort serait pire que rien ;
                  à ajouter le jour où le backend fournira le flux. */}
              <FieldError errors={[errors.password]} />
            </Field>

            {/* disabled pendant la soumission : empêche le double envoi
                (deux logins concurrents) ; le spinner montre l'attente. */}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner data-icon="inline-start" />}
              Se connecter
            </Button>

            {/* Passerelle vers l'inscription. Base UI n'a pas asChild :
                la prop render substitue le <Link> Next.js au <button>
                tout en conservant le style et l'accessibilité. */}
            <p className="text-center text-sm text-muted-foreground">
              Pas encore de compte ?{" "}
              <Button variant="link" className="h-auto p-0" nativeButton={false} render={<Link href="/register" />}>
                Inscrire ma clinique
              </Button>
            </p>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
