/**
 * Page d'accueil du portail B2B ("/" sur le port 3001).
 *
 * Page vitrine provisoire du squelette : elle sert surtout à vérifier que
 * la chaîne UI fonctionne (Tailwind, tokens de thème comme text-brand et
 * text-muted-foreground, composant Button shadcn, icônes lucide-react)
 * et à orienter le visiteur vers les deux portes d'entrée de l'app :
 * la connexion (/login) et l'inscription d'une clinique (/register).
 * C'est un Server Component : aucun état ni interactivité ici.
 */
import { Stethoscope } from "lucide-react";
import Link from "next/link";

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
      {/* Les deux parcours d'entrée. Base UI n'a pas asChild (Radix) :
          la prop render substitue le <Link> Next.js au <button> tout en
          conservant le style et l'accessibilité du Button. */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button size="lg" nativeButton={false} render={<Link href="/login" />}>
          Se connecter
        </Button>
        <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/register" />}>
          Inscrire ma clinique
        </Button>
      </div>
      {/* Badge de contrôle visuel : rappelle que le B2B tourne sur :3001
          (le B2C, portail propriétaires d'animaux, occupe le :3000). */}
      <span className="text-muted-foreground rounded-full border px-3 py-1 font-mono text-sm">
        port 3001
      </span>
    </main>
  );
}
