/**
 * Page /mon-compte du portail propriétaires : la fiche du compte.
 *
 * Server Component mince : métadonnées + délégation au Client Component
 * AccountContent. La protection (session requise) est déjà assurée par
 * l'AuthGuard du layout du groupe (protected), pas besoin de la répéter.
 */
import type { Metadata } from "next";

import { AccountContent } from "@/components/account/account-content";

export const metadata: Metadata = {
  title: "Mon compte — VetoLib",
  description: "Votre profil et vos préférences de rappels.",
};

export default function AccountPage() {
  return <AccountContent />;
}
