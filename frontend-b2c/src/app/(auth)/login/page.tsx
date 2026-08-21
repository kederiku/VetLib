/**
 * Page /login du portail propriétaires.
 *
 * Server Component volontairement mince : il porte les métadonnées SEO
 * (exportables uniquement depuis un Server Component) et délègue toute
 * l'interactivité au Client Component LoginForm. Le GuestGuard renvoie
 * vers /mon-compte un propriétaire déjà connecté.
 *
 * max-w-md : la largeur est portée par la page depuis que le parcours
 * d'inscription, plus large, partage ce même layout.
 */
import type { Metadata } from "next";

import { GuestGuard } from "@/components/auth/guest-guard";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Connexion — VetoLib",
  description:
    "Connectez-vous à votre compte VetoLib pour gérer vos rendez-vous vétérinaires.",
};

export default function LoginPage() {
  return (
    <div className="mx-auto w-full max-w-md">
      <GuestGuard>
        <LoginForm />
      </GuestGuard>
    </div>
  );
}
