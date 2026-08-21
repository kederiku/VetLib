/**
 * Layout du groupe de routes (protected) : toutes les pages qui exigent
 * une session propriétaire (/tableau-de-bord, /rendez-vous, /animaux,
 * /mon-compte...).
 *
 * Le route group (parenthèses = invisible dans l'URL) permet d'appliquer
 * l'AuthGuard UNE fois ici plutôt que de le répéter dans chaque page.
 * Le layout reste un Server Component ; l'AuthGuard est un Client
 * Component (session TanStack Query) et l'AppShell un Server Component
 * asynchrone (il lit les cookies) : Next.js autorise très bien cette
 * imbrication, le layout construit l'élément AppShell et le passe en
 * children au garde.
 *
 * Ordre d'imbrication : AuthGuard DEHORS, AppShell DEDANS — la sidebar
 * ne doit jamais apparaître pour un visiteur non connecté (pendant la
 * vérification, l'AuthGuard affiche son squelette plein écran).
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
