/**
 * Page /register du portail B2B (inscription d'une clinique).
 *
 * Server Component mince : métadonnées SEO + délégation au Client
 * Component RegisterClinicForm, sous GuestGuard (un utilisateur déjà
 * connecté n'a pas à créer une nouvelle clinique depuis cet écran).
 */
import type { Metadata } from "next";

import { GuestGuard } from "@/components/auth/guest-guard";
import { RegisterClinicForm } from "@/components/auth/register-clinic-form";

export const metadata: Metadata = {
  title: "Inscription — VetoLib Pro",
  description:
    "Créez l'espace VetoLib Pro de votre clinique vétérinaire en quelques minutes.",
};

export default function RegisterPage() {
  return (
    <GuestGuard>
      <RegisterClinicForm />
    </GuestGuard>
  );
}
