/**
 * Layout racine du portail B2B (App Router Next.js).
 *
 * Dans l'App Router, ce fichier est obligatoire : il enveloppe TOUTES les
 * pages de l'application et porte les balises <html>/<body>. C'est un
 * Server Component (pas de "use client") : il est rendu côté serveur et
 * peut exporter `metadata` pour le SEO. Tout ce qui a besoin d'état React
 * côté navigateur (le QueryClient TanStack) est délégué à <Providers>,
 * qui lui est un Client Component.
 */
import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

// Métadonnées par défaut de toutes les pages (balises <title> et
// <meta name="description">) ; une page peut les surcharger localement.
export const metadata: Metadata = {
  title: "VetoLib Pro — Espace clinique",
  description:
    "VetoLib Pro : gérez votre clinique vétérinaire, vos praticiens et vos rendez-vous.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // lang="fr" : produit destiné aux cliniques françaises (accessibilité,
    // correcteurs, lecteurs d'écran s'appuient sur cet attribut).
    <html lang="fr" className="font-sans">
      <body className="antialiased">
        {/* Frontière Server -> Client : les pages (children) restent des
            Server Components, mais elles sont rendues SOUS le provider
            TanStack Query, donc leurs composants clients peuvent utiliser
            les hooks générés par Orval. */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
