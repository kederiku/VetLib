/**
 * Page /animaux/[id] : la fiche d'un animal.
 *
 * Server Component mince : métadonnées + délégation au Client Component
 * PetDetailContent. `params` est asynchrone depuis Next 15/16, d'où le
 * composant async.
 */
import type { Metadata } from "next";

import { PetDetailContent } from "@/components/pets/pet-detail-content";

export const metadata: Metadata = {
  title: "Fiche animal — VetoLib",
  description: "L'identité de votre compagnon et son historique de visites.",
};

export default async function PetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PetDetailContent id={id} />;
}
