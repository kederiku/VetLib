/**
 * Page /animaux du portail propriétaires : la liste de mes animaux.
 *
 * Server Component mince : métadonnées + délégation au Client Component
 * PetsContent. La protection (session requise) est déjà assurée par
 * l'AuthGuard du layout du groupe (protected), pas besoin de la répéter.
 */
import type { Metadata } from "next";

import { PetsContent } from "@/components/pets/pets-content";

export const metadata: Metadata = {
  title: "Mes animaux — VetoLib",
  description: "Vos compagnons enregistrés sur VetoLib.",
};

export default function PetsPage() {
  return <PetsContent />;
}
