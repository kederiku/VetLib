/**
 * Page d'accueil du portail B2C (route "/", convention App Router :
 * src/app/page.tsx). Pour l'instant un simple écran vitrine qui valide le
 * squelette : icône lucide-react, bouton shadcn, classes Tailwind.
 *
 * Server Component (pas de "use client") : rendu côté serveur, zéro JS client.
 * Le badge "port 3000" rappelle quel frontend on regarde : le B2C tourne sur
 * :3000 (propriétaires d'animaux), le B2B sur :3001 (cliniques).
 */
import { PawPrint } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="flex items-center gap-3">
        {/* aria-hidden : l'icône est purement décorative, le titre à côté
            porte déjà le sens pour les lecteurs d'écran. */}
        <PawPrint className="size-10 text-brand" aria-hidden />
        <h1 className="text-4xl font-bold tracking-tight">VetoLib</h1>
      </div>
      <p className="text-muted-foreground text-lg">Portail propriétaires</p>
      <Button size="lg">Prendre rendez-vous</Button>
      <span className="text-muted-foreground rounded-full border px-3 py-1 font-mono text-sm">
        port 3000
      </span>
    </main>
  );
}
