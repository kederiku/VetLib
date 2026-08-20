/**
 * Page /rendez-vous/nouveau : le wizard de prise de rendez-vous en
 * 5 étapes (clinique, motif, animal, créneau, confirmation).
 *
 * Server Component mince : métadonnées + délégation au Client Component
 * BookingWizard (tout l'état du parcours est local au wizard, rien dans
 * l'URL). La protection est assurée par l'AuthGuard du layout parent.
 */
import type { Metadata } from "next";

import { BookingWizard } from "@/components/booking/booking-wizard";

export const metadata: Metadata = {
  title: "Prendre rendez-vous — VetoLib",
  description: "Réservez une consultation vétérinaire en quelques clics.",
};

export default function NewAppointmentPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold tracking-tight">Prendre rendez-vous</h1>
      <BookingWizard />
    </main>
  );
}
