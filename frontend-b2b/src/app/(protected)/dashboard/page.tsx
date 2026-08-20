/**
 * Page /dashboard du portail B2B.
 *
 * Server Component mince : métadonnées + délégation au Client Component
 * DashboardContent. La protection (session requise) est déjà assurée par
 * l'AuthGuard du layout du groupe (protected), pas besoin de la répéter.
 */
import type { Metadata } from "next";

import { DashboardContent } from "@/components/dashboard/dashboard-content";

export const metadata: Metadata = {
  title: "Tableau de bord — VetoLib Pro",
  description: "Vue d'ensemble de votre clinique.",
};

export default function DashboardPage() {
  return <DashboardContent />;
}
