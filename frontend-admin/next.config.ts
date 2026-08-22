/**
 * Configuration Next.js du back-office plateforme (port 3003).
 *
 * Deux réglages seulement, mais le second est propre à cette application.
 */
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Identique aux deux portails : `next build` produit dans .next/standalone
  // un serveur Node autonome, format attendu par docker/frontend/Dockerfile.
  output: "standalone",

  // Console INTERNE, réservée aux exploitants : elle ne doit jamais apparaître
  // dans un moteur de recherche, même si son hôte venait à fuiter. L'en-tête
  // est posé au niveau SERVEUR (et pas seulement en <meta>) pour couvrir aussi
  // les réponses non-HTML. C'est la seule divergence de configuration Next
  // entre les trois applications — les deux portails, eux, sont publics.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
