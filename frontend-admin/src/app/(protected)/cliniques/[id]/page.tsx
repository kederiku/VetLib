/**
 * Route /cliniques/[id] : la fiche d'une clinique.
 *
 * `params` est une PROMESSE depuis Next 15 : la page est donc async, et
 * l'identifiant est passé au composant client une fois résolu. Aucune donnée
 * n'est chargée ici — la fiche a besoin de la session en cookie et du cache
 * React Query, deux choses qui vivent côté client dans ce projet.
 */
import type { Metadata } from "next";

import { ClinicDetailContent } from "@/components/clinics/clinic-detail-content";

export const metadata: Metadata = {
  title: "Fiche clinique — VetoLib Admin",
  description: "Identité, chiffres et personnel d'une clinique.",
};

export default async function CliniqueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClinicDetailContent clinicId={id} />;
}
