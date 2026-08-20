/**
 * Layout du groupe de routes (protected) : toutes les pages qui exigent
 * une session (dashboard, agenda, réglages...).
 *
 * Le route group (parenthèses = invisible dans l'URL) permet d'appliquer
 * l'AuthGuard UNE fois ici plutôt que de le répéter dans chaque page.
 * Le layout reste un Server Component ; l'AuthGuard, lui, est un Client
 * Component (il interroge la session via TanStack Query) : Next.js
 * autorise très bien cette imbrication Server -> Client.
 *
 * L'AppShell (sidebar + zone de contenu) vit SOUS l'AuthGuard : la
 * sidebar lit la session (nom de clinique, permissions), elle ne doit
 * être montée qu'une fois la session vérifiée — et elle survit aux
 * navigations internes (layout persistant Next.js, pas de re-montage).
 */
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/layout/app-shell";

export default function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}
