/**
 * Page /tableau-de-bord : l'accueil du portail connecté.
 *
 * C'est la cible de la connexion, du GuestGuard et du logo de la
 * sidebar. Server Component mince : métadonnées + délégation au Client
 * Component DashboardContent. La protection (session requise) est déjà
 * assurée par l'AuthGuard du layout du groupe (protected).
 */
import type { Metadata } from "next";

import { DashboardContent } from "@/components/dashboard/dashboard-content";

export const metadata: Metadata = {
  title: "Tableau de bord — VetoLib",
  description: "Vos rendez-vous et vos animaux, en un coup d'œil.",
};

export default function DashboardPage() {
  return <DashboardContent />;
}
