/**
 * Route /proprietaires : les comptes du portail propriétaires.
 *
 * Server Component réduit à ses métadonnées, comme les autres écrans : tout
 * le contenu dépend de l'URL et du cache React Query, donc du client.
 */
import type { Metadata } from "next";

import { OwnersContent } from "@/components/owners/owners-content";

export const metadata: Metadata = {
  title: "Propriétaires — VetoLib Admin",
  description: "Liste et gestion des comptes du portail propriétaires.",
};

export default function ProprietairesPage() {
  return <OwnersContent />;
}
