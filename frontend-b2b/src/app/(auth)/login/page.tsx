/**
 * Page /login du portail B2B.
 *
 * Server Component volontairement mince : il porte les métadonnées SEO
 * (exportables uniquement depuis un Server Component) et délègue toute
 * l'interactivité au Client Component LoginForm. Le GuestGuard renvoie
 * vers /dashboard un utilisateur déjà connecté.
 */
import type { Metadata } from "next";

import { GuestGuard } from "@/components/auth/guest-guard";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Connexion — VetoLib Pro",
  description: "Connectez-vous à l'espace de gestion de votre clinique.",
};

export default function LoginPage() {
  return (
    <GuestGuard>
      <LoginForm />
    </GuestGuard>
  );
}
