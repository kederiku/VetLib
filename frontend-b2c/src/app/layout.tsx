/**
 * Layout racine de l'App Router (convention Next.js : src/app/layout.tsx).
 *
 * C'est le composant qui enveloppe TOUTES les pages du portail B2C : il rend
 * les balises <html> et <body>, charge le CSS global (Tailwind) et installe
 * les providers React partagés. C'est un Server Component (pas de directive
 * "use client") : il est rendu côté serveur et n'embarque aucun JavaScript
 * dans le bundle envoyé au navigateur.
 */
import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

// Export "metadata" : convention App Router pour renseigner le <head>
// (balises <title> et <meta name="description">) sans le manipuler à la main.
// Défini ici, il sert de valeur par défaut pour toutes les pages.
export const metadata: Metadata = {
  title: "VetoLib — Prenez rendez-vous",
  description:
    "Prenez rendez-vous pour votre animal avec un vétérinaire proche de chez vous.",
};

export default function RootLayout({
  children, // la page active, injectée par le routeur selon l'URL
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="font-sans">
      <body className="antialiased">
        {/* Providers est un Client Component ("use client") : c'est la
            frontière serveur/client. Un Server Component ne peut pas créer
            de contexte React, mais il peut en imbriquer un et lui passer
            des enfants rendus côté serveur, comme ici. */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
