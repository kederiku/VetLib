/**
 * Layout du groupe de routes (protected) : toutes les pages qui exigent
 * une session propriétaire (/mon-compte, /animaux, /rendez-vous...).
 *
 * Le route group (parenthèses = invisible dans l'URL) permet d'appliquer
 * l'AuthGuard UNE fois ici plutôt que de le répéter dans chaque page.
 * Le layout reste un Server Component ; l'AuthGuard et l'OwnerShell,
 * eux, sont des Client Components (session TanStack Query, usePathname) :
 * Next.js autorise très bien cette imbrication Server -> Client.
 *
 * Ordre d'imbrication : AuthGuard DEHORS, OwnerShell DEDANS — la barre
 * de navigation ne doit jamais apparaître pour un visiteur non connecté
 * (pendant la vérification, l'AuthGuard affiche son squelette plein
 * écran, sans header).
 */
import { AuthGuard } from "@/components/auth/auth-guard";
import { OwnerShell } from "@/components/layout/owner-shell";

export default function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AuthGuard>
      <OwnerShell>{children}</OwnerShell>
    </AuthGuard>
  );
}
