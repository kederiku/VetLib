/**
 * Page /rendez-vous du portail propriétaires : mes rendez-vous, toutes
 * cliniques confondues.
 *
 * Server Component mince : métadonnées + délégation au Client Component
 * AppointmentsContent. La protection (session requise) est déjà assurée
 * par l'AuthGuard du layout du groupe (protected).
 */
import type { Metadata } from "next";

import { AppointmentsContent } from "@/components/appointments/appointments-content";

export const metadata: Metadata = {
  title: "Mes rendez-vous — VetoLib",
  description: "Vos rendez-vous vétérinaires à venir et passés.",
};

export default function AppointmentsPage() {
  return <AppointmentsContent />;
}
