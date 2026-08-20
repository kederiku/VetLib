/**
 * Page /reglages du portail B2B.
 *
 * Server Component mince : métadonnées + délégation au Client Component
 * SettingsContent. La session est vérifiée par l'AuthGuard du layout ;
 * la permission clinic:manage est vérifiée DANS SettingsContent (état
 * "accès réservé" plutôt qu'une redirection), et de toute façon
 * re-vérifiée par le backend sur chaque endpoint de réglages.
 */
import type { Metadata } from "next";

import { SettingsContent } from "@/components/settings/settings-content";

export const metadata: Metadata = {
  title: "Réglages — VetoLib Pro",
  description:
    "Fiche de la clinique, types de rendez-vous, praticiens et horaires.",
};

export default function SettingsPage() {
  return <SettingsContent />;
}
