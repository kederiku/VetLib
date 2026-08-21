/**
 * Page /rendez-vous/[id] : la fiche d'un rendez-vous.
 *
 * Server Component mince : métadonnées + délégation au Client Component
 * AppointmentDetailContent. `params` est asynchrone depuis Next 15/16,
 * d'où le composant async.
 *
 * Pas de collision avec /rendez-vous/nouveau : dans l'App Router, un
 * segment STATIQUE l'emporte toujours sur un segment dynamique, quel que
 * soit l'ordre des dossiers.
 */
import type { Metadata } from "next";

import { AppointmentDetailContent } from "@/components/appointments/appointment-detail-content";

export const metadata: Metadata = {
  title: "Rendez-vous — VetoLib",
  description: "Le détail de votre rendez-vous vétérinaire.",
};

export default async function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AppointmentDetailContent id={id} />;
}
