/**
 * Page /login du portail propriétaires.
 *
 * Server Component volontairement mince : il porte les métadonnées SEO
 * (exportables uniquement depuis un Server Component) et délègue toute
 * l'interactivité au Client Component LoginForm. Le GuestGuard renvoie
 * vers /account un propriétaire déjà connecté.
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
    <GuestGuard>
      <LoginForm />
    </GuestGuard>
  );
}
