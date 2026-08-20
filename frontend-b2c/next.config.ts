/**
 * Configuration Next.js du portail B2C (propriétaires d'animaux, port 3000).
 *
 * Fichier lu par Next.js au démarrage (dev comme build). Il est volontairement
 * minimal : le routage, le rendu et le CSS sont gérés par les conventions de
 * l'App Router (dossier src/app), pas par de la configuration.
 */
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" : `next build` produit un dossier .next/standalone contenant
  // un server.js autonome et SEULEMENT les node_modules réellement utilisés
  // (détectés par traçage des imports). C'est le format attendu par une image
  // Docker de production légère : on copie ce dossier, pas tout node_modules.
  // En dev, ce réglage est sans effet : les frontends tournent hors Docker
  // (`npm run dev`), seuls l'API et l'infra sont dans docker compose.
  output: "standalone",
};

export default nextConfig;
