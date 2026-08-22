/**
 * Layout racine du back-office plateforme (App Router Next.js).
 *
 * Server Component : il porte <html>/<body> et les métadonnées. Tout ce qui
 * a besoin d'état React côté navigateur (QueryClient, thème, toasts) est
 * délégué à <Providers>, un Client Component.
 */
import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

// robots: noindex — doublon volontaire de l'en-tête X-Robots-Tag posé par
// next.config.ts. Le <meta> couvre le HTML, l'en-tête couvre TOUTES les
// réponses : une console d'exploitation n'a rien à faire dans un index.
export const metadata: Metadata = {
  title: "VetoLib Admin — Console de la plateforme",
  description: "Administration de la plateforme VetoLib. Accès réservé.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning : next-themes pose la classe "dark" sur <html>
    // AVANT l'hydratation (script anti-flash) ; sans cet attribut React
    // signalerait un faux écart serveur/client sur cette seule balise.
    <html lang="fr" className="font-sans" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
