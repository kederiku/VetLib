/**
 * Layout du groupe de routes (protected) : toutes les pages qui exigent
 * une session propriétaire (/account, et bientôt les animaux, les
 * rendez-vous...).
 *
 * Le route group (parenthèses = invisible dans l'URL) permet d'appliquer
 * l'AuthGuard UNE fois ici plutôt que de le répéter dans chaque page.
 * Le layout reste un Server Component ; l'AuthGuard, lui, est un Client
 * Component (il interroge la session via TanStack Query) : Next.js
 * autorise très bien cette imbrication Server -> Client.
 */
import { AuthGuard } from "@/components/auth/auth-guard";

export default function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <AuthGuard>{children}</AuthGuard>;
}
