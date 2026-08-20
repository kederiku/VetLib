/**
 * Page d'accueil du portail B2C (route "/", convention App Router :
 * src/app/page.tsx). Écran vitrine qui oriente le visiteur vers les deux
 * portes d'entrée du portail : la connexion (/login) et la création de
 * compte (/register).
 *
 * Server Component (pas de "use client") : rendu côté serveur, zéro JS client.
 * Le badge "port 3000" rappelle quel frontend on regarde : le B2C tourne sur
 * :3000 (propriétaires d'animaux), le B2B sur :3001 (cliniques).
 */
import { PawPrint } from "lucide-react";
import Link from "next/link";

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
      {/* Les deux parcours d'entrée. Base UI n'a pas asChild (Radix) : la
          prop render substitue le <Link> Next.js au <button> tout en
          conservant le style et l'accessibilité du Button, et
          nativeButton={false} précise que l'élément rendu n'est plus un
          vrai <button> (sinon warning console Base UI). */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button size="lg" nativeButton={false} render={<Link href="/login" />}>
          Se connecter
        </Button>
        <Button
          size="lg"
          variant="outline"
          nativeButton={false}
          render={<Link href="/register" />}
        >
          Créer mon compte
        </Button>
      </div>
      <span className="text-muted-foreground rounded-full border px-3 py-1 font-mono text-sm">
        port 3000
      </span>
    </main>
  );
}
