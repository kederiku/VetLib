/**
 * Page /register du portail propriétaires (création de compte).
 *
 * Server Component mince : métadonnées SEO + délégation au Client
 * Component RegisterOwnerForm, sous GuestGuard (un propriétaire déjà
 * connecté n'a pas à recréer un compte depuis cet écran).
 */
import type { Metadata } from "next";

import { GuestGuard } from "@/components/auth/guest-guard";
import { RegisterOwnerForm } from "@/components/auth/register-owner-form";

export const metadata: Metadata = {
  title: "Créer mon compte — VetoLib",
  description:
    "Créez votre compte VetoLib pour prendre rendez-vous avec un vétérinaire pour vos animaux.",
};

export default function RegisterPage() {
  return (
    <GuestGuard>
      <RegisterOwnerForm />
    </GuestGuard>
  );
}
