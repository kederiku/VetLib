/**
 * Page d'accueil du portail B2B ("/" sur le port 3001).
 *
 * Landing sobre de l'espace clinique : un hero (pastille de marque,
 * titre, tagline) et les deux portes d'entrée de l'app — la connexion
 * (/login, action primaire) et l'inscription d'une clinique (/register).
 * C'est un Server Component : aucun état ni interactivité ici.
 */
import { Stethoscope } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex min-h-svh flex-col">
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
        {/* Pastille de marque : mêmes tokens brand que le reste de
            l'app (layout auth, sidebar), pour une identité cohérente. */}
        <div className="flex size-14 items-center justify-center rounded-2xl bg-brand text-brand-foreground">
          {/* aria-hidden : l'icône est purement décorative, le titre qui
              suit porte déjà le sens pour les lecteurs d'écran. */}
          <Stethoscope className="size-7" aria-hidden />
        </div>
        <h1 className="text-4xl font-bold tracking-tight">VetoLib Pro</h1>
        <p className="max-w-md text-lg text-muted-foreground">
          La gestion de rendez-vous pensée pour votre clinique vétérinaire.
        </p>
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
      </main>
      {/* Pied de page discret : la landing reste minimale, pas de plan
          de site ni de liens légaux à ce stade du projet. */}
      <footer className="p-6 text-center text-xs text-muted-foreground">
        © VetoLib
      </footer>
    </div>
  );
}
