/**
 * Page /login du back-office.
 *
 * Server Component mince : métadonnées + délégation au formulaire client,
 * sous le GuestGuard (un administrateur déjà connecté est renvoyé vers son
 * tableau de bord).
 */
import type { Metadata } from "next";

import { AdminLoginForm } from "@/components/auth/admin-login-form";
import { GuestGuard } from "@/components/auth/guest-guard";

export const metadata: Metadata = {
  title: "Connexion — VetoLib Admin",
  description: "Console d'administration de la plateforme VetoLib.",
};

export default function LoginPage() {
  return (
    <GuestGuard>
      <AdminLoginForm />
    </GuestGuard>
  );
}
