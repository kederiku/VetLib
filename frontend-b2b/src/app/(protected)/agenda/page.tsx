/**
 * Page /agenda du portail B2B.
 *
 * Server Component mince : métadonnées + délégation au Client Component
 * AgendaContent. La protection (session requise) est déjà assurée par
 * l'AuthGuard du layout du groupe (protected), pas besoin de la répéter.
 */
import type { Metadata } from "next";

import { AgendaContent } from "@/components/agenda/agenda-content";

export const metadata: Metadata = {
  title: "Agenda — VetoLib Pro",
  description: "Les rendez-vous de votre clinique, par jour et par praticien.",
};

export default function AgendaPage() {
  return <AgendaContent />;
}
