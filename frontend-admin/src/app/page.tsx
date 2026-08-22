/**
 * Racine "/" du back-office : une simple redirection.
 *
 * Pas de page d'accueil, contrairement aux deux portails. Il n'y a rien à
 * vendre ici, et une landing publique ANNONCERAIT l'existence de la console
 * à qui tomberait dessus. Un visiteur sans session atterrit donc sur
 * /tableau-de-bord, d'où l'AuthGuard le renverra vers /login.
 */
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/tableau-de-bord");
}
