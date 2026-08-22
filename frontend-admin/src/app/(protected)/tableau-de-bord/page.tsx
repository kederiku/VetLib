/**
 * Écran d'accueil du back-office : compteurs et derniers inscrits.
 *
 * Server Component réduit à ses métadonnées, comme les autres écrans de la
 * console -- tout le contenu dépend du cache React Query, donc du client.
 */
import type { Metadata } from "next";

import { DashboardContent } from "@/components/dashboard/dashboard-content";

export const metadata: Metadata = {
  title: "Tableau de bord — VetoLib Admin",
  description: "Vue d'ensemble de la plateforme VetoLib.",
};

export default function DashboardPage() {
  return <DashboardContent />;
}
