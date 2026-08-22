/**
 * Layout du groupe (protected) : tous les écrans qui exigent une session.
 *
 * L'AuthGuard est appliqué UNE fois ici plutôt que répété dans chaque page.
 * L'ordre est load-bearing : AuthGuard DEHORS, AppShell DEDANS — la sidebar
 * ne doit jamais apparaître, même un instant, pour un visiteur non connecté.
 *
 * Rappel : il n'existe aucun middleware.ts dans ce dépôt. Cette garde est un
 * confort d'expérience, PAS une barrière de sécurité — l'autorité est le
 * backend (cookie + claim kind="platform" + relecture du compte en base à
 * chaque requête).
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
