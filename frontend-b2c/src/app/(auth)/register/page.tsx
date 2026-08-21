/**
 * Page /register du portail propriétaires (parcours d'inscription).
 *
 * Server Component mince : métadonnées SEO + délégation au Client Component
 * RegisterWizard.
 *
 * Le GuestGuard n'est PAS posé ici mais À L'INTÉRIEUR du wizard : l'étape 1
 * crée le compte et ouvre la session, les étapes suivantes se déroulent donc
 * connecté sur cette même page. Un garde posé au niveau de la page éjecterait
 * la personne vers le tableau de bord au milieu de son inscription.
 *
 * max-w-xl (et non le max-w-md de /login) : le parcours porte un bloc adresse
 * et une liste d'animaux, trop à l'étroit dans la largeur d'un formulaire de
 * connexion.
 */
import type { Metadata } from "next";

import { RegisterWizard } from "@/components/auth/register/register-wizard";

export const metadata: Metadata = {
  title: "Créer mon compte — VetoLib",
  description:
    "Créez votre compte VetoLib pour prendre rendez-vous avec un vétérinaire pour vos animaux.",
};

export default function RegisterPage() {
  return (
    <div className="mx-auto w-full max-w-xl">
      <RegisterWizard />
    </div>
  );
}
