/**
 * Contenu de la page /mon-compte : la fiche du propriétaire connecté.
 *
 * QUATRE CARTES INDEPENDANTES plutôt qu'un formulaire unique de 400
 * lignes derrière un seul bouton. Corriger une faute de frappe dans son
 * prénom ne doit pas faire repartir l'adresse et les préférences, et une
 * erreur 422 sur l'adresse ne doit pas bloquer l'enregistrement du
 * prénom.
 *
 * Pourquoi des cartes empilées et non des onglets : les quatre blocs
 * totalisent une dizaine de champs. Des onglets imposeraient un choix de
 * navigation avant de rien voir, et masqueraient derrière un onglet
 * fermé le champ manquant que le tableau de bord vient justement de
 * signaler.
 *
 * useSaveOwnerProfile est appelé UNE SEULE FOIS ici et distribué en
 * props : c'est ce qui rend `isSaving` partagé, donc les envois
 * sérialisés. Deux enregistrements concurrents partiraient tous deux
 * d'une base pré-mutation, et le second écraserait le premier.
 *
 * Colonne étroite (width="narrow") : ce sont des formulaires, une
 * colonne resserrée reste plus lisible que la pleine largeur.
 */
"use client";

import { AddressForm } from "@/components/account/address-form";
import { LoginInfoCard } from "@/components/account/login-info-card";
import { PersonalInfoForm } from "@/components/account/personal-info-form";
import { RemindersForm } from "@/components/account/reminders-form";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { useSaveOwnerProfile } from "@/lib/account/use-save-owner-profile";
import { useCurrentUser } from "@/lib/auth/use-current-user";

export function AccountContent() {
  const { data: owner } = useCurrentUser();
  const enregistrement = useSaveOwnerProfile();

  // L'AuthGuard (layout parent) garantit qu'on n'arrive ici que
  // connecté ; ce garde-fou couvre l'instant de transition où la query
  // n'est pas encore résolue (et rassure TypeScript sur undefined).
  // Monter des formulaires vides puis les remplir ferait clignoter la
  // page et risquerait d'écraser une saisie rapide.
  if (owner === undefined) {
    return null;
  }

  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Mon compte"
        description="Vos coordonnées, votre adresse et vos préférences de rappels."
      />

      <PersonalInfoForm owner={owner} {...enregistrement} />
      <AddressForm owner={owner} {...enregistrement} />
      <RemindersForm owner={owner} {...enregistrement} />
      <LoginInfoCard owner={owner} />
    </PageContainer>
  );
}
