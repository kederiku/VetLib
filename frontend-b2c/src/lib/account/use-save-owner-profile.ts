/**
 * Enregistrement d'UNE section de la fiche propriétaire.
 *
 * LE PROBLEME : le backend n'expose qu'un `PUT /owner/profile`, qui
 * REMPLACE la fiche entière. Or l'écran « Mon compte » est découpé en
 * cartes indépendantes (informations, adresse, rappels), chacune avec
 * son bouton — corriger une faute de frappe dans son prénom ne doit pas
 * faire repartir l'adresse, et une erreur sur l'adresse ne doit pas
 * bloquer l'enregistrement du prénom.
 *
 * LA SOLUTION : chaque carte envoie un « patch » de ses seuls champs, et
 * ce hook reconstitue le corps complet en le fusionnant avec l'état
 * serveur courant.
 *
 * DEUX REGLES A NE PAS ENFREINDRE, sous peine de perte de données
 * silencieuse :
 *
 * 1. L'ETAT SERVEUR EST LU DANS `save`, JAMAIS AU RENDU. Une variable
 *    capturée par fermeture peut dater d'avant l'enregistrement d'une
 *    autre carte : on ressusciterait alors l'ancienne adresse en
 *    enregistrant son prénom. C'est le bug le plus probable de cet
 *    écran, et le plus difficile à voir en relecture.
 * 2. LES ENVOIS SONT SERIALISES : `isSaving` est partagé par les trois
 *    cartes (le hook est appelé UNE fois par l'écran et distribué en
 *    props). Deux enregistrements concurrents partiraient tous deux
 *    d'une base pré-mutation, et le second écraserait le premier.
 */
"use client";

import { useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api/errors";
import { getGetCurrentOwnerQueryKey } from "@/lib/api/generated/owner-auth/owner-auth";
import { useUpdateOwnerProfile } from "@/lib/api/generated/owner-profile/owner-profile";
import type {
  OwnerResponse,
  UpdateOwnerProfileRequest,
} from "@/lib/api/generated/vetoLibAPI.schemas";

/** Forme du cache de /me : le mutator enveloppe la réponse. */
type CacheOwner = { status: number; data: OwnerResponse };

/**
 * Projette l'état serveur en corps de PUT complet.
 *
 * C'est la BASE sur laquelle chaque section applique son patch : tout ce
 * que la carte ne touche pas repart tel quel.
 */
function ownerToRequest(owner: OwnerResponse): UpdateOwnerProfileRequest {
  return {
    first_name: owner.first_name,
    last_name: owner.last_name,
    phone: owner.phone,
    address: owner.address,
    notification_preferences: owner.notification_preferences,
  };
}

export type SaveOwnerProfile = {
  /** Enregistre la section ; lève en cas d'échec (le formulaire traduit). */
  save: (patch: Partial<UpdateOwnerProfileRequest>) => Promise<OwnerResponse>;
  isSaving: boolean;
};

export function useSaveOwnerProfile(): SaveOwnerProfile {
  const queryClient = useQueryClient();
  // TError = ApiError : le mutator jette toujours un ApiError normalisé.
  const mutation = useUpdateOwnerProfile<ApiError>();

  const save = async (patch: Partial<UpdateOwnerProfileRequest>) => {
    // LECTURE AU MOMENT DE L'ENVOI (voir règle 1 de la docstring).
    const cache = queryClient.getQueryData<CacheOwner>(
      getGetCurrentOwnerQueryKey(),
    );
    if (cache === undefined) {
      // Ne devrait pas arriver sous l'AuthGuard, mais envoyer un PUT sans
      // base connue effacerait tout ce qu'on ne fournit pas.
      throw new Error("Profil non chargé : enregistrement annulé.");
    }

    const res = await mutation.mutateAsync({
      data: { ...ownerToRequest(cache.data), ...patch },
    });

    // La réponse du PUT est le OwnerResponse à jour : on remplace
    // directement l'entrée de cache de /me. Tous les composants qui
    // lisent useCurrentUser (sidebar, menu du compte, invite de
    // complétion du tableau de bord) se mettent à jour sans requête.
    queryClient.setQueryData(getGetCurrentOwnerQueryKey(), res);

    // Le mutator jette sur tout statut >= 400 : à l'exécution on est
    // forcément en 200 ici. Le test ne sert qu'à rétrécir le type
    // (l'union générée par Orval inclut la variante 422).
    if (res.status !== 200) {
      throw new Error("Réponse inattendue du serveur.");
    }
    return res.data;
  };

  return { save, isSaving: mutation.isPending };
}
