/**
 * Route /cliniques : la liste du parc.
 *
 * Server Component réduit à ses métadonnées, comme partout dans le projet.
 * Tout le contenu est client — il dépend de l'URL, de React Query et de
 * dialogues — et vit dans `ClinicsContent`.
 */
import type { Metadata } from "next";

import { ClinicsContent } from "@/components/clinics/clinics-content";

export const metadata: Metadata = {
  title: "Cliniques — VetoLib Admin",
  description: "Liste et gestion des cliniques inscrites sur la plateforme.",
};

export default function CliniquesPage() {
  return <ClinicsContent />;
}
