/**
 * Écran d'accueil du back-office.
 *
 * Volontairement minimal à ce stade : la console n'a encore aucun endpoint de
 * données à afficher. Les compteurs et les listes arrivent avec les écrans
 * Cliniques, Propriétaires et Personnel.
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
