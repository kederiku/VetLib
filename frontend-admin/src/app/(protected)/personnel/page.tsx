/**
 * Route /personnel : la liste transverse des comptes du personnel.
 *
 * Server Component réduit à ses métadonnées : la liste dépend de l'URL et du
 * cache React Query, donc du client.
 */
import type { Metadata } from "next";

import { StaffContent } from "@/components/staff/staff-content";

export const metadata: Metadata = {
  title: "Personnel — VetoLib Admin",
  description: "Le personnel de toutes les cliniques : rôles et accès.",
};

export default function PersonnelPage() {
  return <StaffContent />;
}
