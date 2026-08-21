/**
 * Page /rendez-vous/nouveau : le tunnel de prise de rendez-vous en
 * 5 étapes (clinique, motif, animal, créneau, confirmation).
 *
 * Server Component mince : métadonnées + délégation au BookingWizard
 * (tout l'état du parcours est local au wizard, rien dans l'URL). La
 * protection est assurée par l'AuthGuard du layout parent, et la mise en
 * page par le PageContainer du wizard — cette page ne rend plus ni
 * <main> (le SidebarInset de la coquille en est déjà un) ni <h1>.
 */
import type { Metadata } from "next";

import { BookingWizard } from "@/components/booking/booking-wizard";

export const metadata: Metadata = {
  title: "Prendre rendez-vous — VetoLib",
  description: "Réservez une consultation vétérinaire en quelques clics.",
};

export default function NewAppointmentPage() {
  return <BookingWizard />;
}
