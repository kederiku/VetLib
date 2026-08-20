/**
 * Page d'accueil du portail B2B ("/" sur le port 3001).
 *
 * Page vitrine provisoire du squelette : elle sert surtout à vérifier que
 * la chaîne UI fonctionne (Tailwind, tokens de thème comme text-brand et
 * text-muted-foreground, composant Button shadcn, icônes lucide-react).
 * Les vrais écrans (planning, praticiens...) viendront la remplacer.
 * C'est un Server Component : aucun état ni interactivité ici.
 */
import { Stethoscope } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="flex items-center gap-3">
        {/* aria-hidden : l'icône est purement décorative, le titre qui suit
            porte déjà le sens pour les lecteurs d'écran. */}
        <Stethoscope className="size-10 text-brand" aria-hidden />
        <h1 className="text-4xl font-bold tracking-tight">VetoLib Pro</h1>
      </div>
      <p className="text-muted-foreground text-lg">Espace clinique</p>
      <Button size="lg">Accéder au planning</Button>
      {/* Badge de contrôle visuel : rappelle que le B2B tourne sur :3001
          (le B2C, portail propriétaires d'animaux, occupe le :3000). */}
      <span className="text-muted-foreground rounded-full border px-3 py-1 font-mono text-sm">
        port 3001
      </span>
    </main>
  );
}
