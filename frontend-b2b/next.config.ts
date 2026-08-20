/**
 * Configuration Next.js du portail B2B (espace cliniques, port 3001).
 *
 * En dev, ce frontend tourne HORS Docker (cf. CLAUDE.md) : `npm run dev`
 * suffit. Cette config ne sert donc surtout qu'au build de production.
 */
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" : `next build` produit dans .next/standalone un serveur
  // Node autonome qui embarque uniquement les node_modules réellement
  // utilisés. C'est le format attendu par le Dockerfile de prod : on copie
  // ce dossier dans une image légère au lieu d'installer tout node_modules.
  output: "standalone",
};

export default nextConfig;
