/**
 * Traduction des erreurs serveur vers les formulaires react-hook-form.
 *
 * Quand l'API rejette une soumission, l'erreur doit apparaître AU BON
 * ENDROIT : sous le champ concerné si on sait lequel (422 de validation,
 * email déjà pris), sinon en bandeau global au-dessus du bouton (erreur
 * "root"). Cette fonction est l'unique traducteur ApiError -> setError,
 * partagée par les formulaires de connexion, d'inscription et de la
 * fiche profil : les libellés français des codes métier vivent ici, à
 * un seul endroit.
 */
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import { getApiError } from "@/lib/api/errors";

// Libelles francais des codes metier NON lies a un champ de formulaire
// (conflits de reservation, regles d'annulation...). Ils sont ranges
// dans une table plutot que dans le switch d'applyServerErrors car
// certains ecrans doivent les afficher HORS formulaire (Alert dans une
// carte de rendez-vous, bandeau du wizard) via businessErrorMessage.
const BUSINESS_ERROR_MESSAGES: Record<string, string> = {
  "scheduling.slot_already_booked":
    "Ce créneau vient d'être réservé, choisissez-en un autre.",
  "scheduling.slot_unavailable": "Ce créneau n'est plus disponible.",
  "scheduling.cancellation_too_late":
    "Ce rendez-vous commence dans moins de 24 h : il ne peut plus être annulé en ligne. Contactez la clinique.",
  "patients.pet_not_found": "Cet animal n'existe plus dans votre compte.",
};

/**
 * Libelle francais d'un code metier "hors formulaire", ou null si le
 * code est inconnu (l'appelant retombe alors sur apiError.detail ou un
 * message generique). Consultee par applyServerErrors ET appelable
 * directement par les ecrans sans formulaire (annulation d'un
 * rendez-vous, conflit de creneau dans le wizard).
 */
export function businessErrorMessage(code: string): string | null {
  return BUSINESS_ERROR_MESSAGES[code] ?? null;
}

/**
 * Applique une erreur survenue pendant la soumission sur le formulaire.
 *
 * @param error       L'erreur attrapée dans le catch du onSubmit (unknown).
 * @param setError    Le setError du useForm appelant.
 * @param knownFields Les noms de champs QUE CE formulaire affiche : une
 *                    erreur 422 sur un champ inconnu (évolution d'API)
 *                    part dans le bandeau global plutôt que d'être
 *                    silencieusement perdue sous un champ inexistant.
 *
 * Convention "root.server" : react-hook-form réserve les clés root.* aux
 * erreurs non liées à un champ ; elles sont lues via errors.root?.server
 * et NE bloquent pas la re-soumission (contrairement aux erreurs champ,
 * effacées à la prochaine validation).
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  knownFields: readonly Path<T>[],
): void {
  const apiError = getApiError(error);

  // Pas un ApiError : le serveur n'a jamais répondu (backend éteint,
  // panne réseau, CORS). Message générique, il n'y a rien de plus précis
  // à dire à l'utilisateur.
  if (apiError === null) {
    setError("root.server", {
      message:
        "Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.",
    });
    return;
  }

  // 422 : validation Pydantic champ par champ. Chaque entrée localise le
  // champ fautif via loc = ["body", "nom_du_champ"] ; on route son msg
  // sous le champ correspondant du formulaire.
  if (apiError.validation !== undefined) {
    for (const validationError of apiError.validation) {
      // loc[0] vaut "body", loc[1] est le nom du champ Pydantic (qui
      // correspond exactement aux noms de nos champs de formulaire).
      const fieldName = String(validationError.loc[1]);
      if ((knownFields as readonly string[]).includes(fieldName)) {
        setError(fieldName as Path<T>, { message: validationError.msg });
      } else {
        // Champ inconnu du formulaire : plutôt que de perdre l'info,
        // on l'affiche dans le bandeau global.
        setError("root.server", { message: validationError.msg });
      }
    }
    return;
  }

  // Codes métier connus -> libellés français choisis pour l'utilisateur.
  switch (apiError.code) {
    case "identity.email_already_exists":
      // Erreur attribuable à UN champ précis : on la met sous ce champ.
      setError("email" as Path<T>, {
        message: "Cette adresse email est déjà utilisée.",
      });
      return;
    case "identity.password_compromised":
      // Mot de passe conforme (longueur) mais présent dans une fuite connue :
      // le backend est le seul à pouvoir le savoir (corpus Have I Been Pwned),
      // l'erreur arrive donc forcément du serveur. Elle est attribuable à UN
      // champ précis, on la place dessous plutôt que dans le bandeau global.
      setError("password" as Path<T>, {
        message:
          "Ce mot de passe figure dans une fuite de données connue. Choisissez-en un autre.",
      });
      return;
    case "identity.invalid_credentials":
      // Message volontairement flou (email OU mot de passe) : ne jamais
      // révéler si un compte existe pour une adresse donnée.
      setError("root.server", { message: "Email ou mot de passe incorrect." });
      return;
    case "identity.user_inactive":
      setError("root.server", { message: "Ce compte est désactivé." });
      return;
    default: {
      // Codes metier "hors formulaire" (scheduling, patients...) : la
      // table partagee fournit le libelle francais. A defaut, on affiche
      // le detail brut du backend, faute de mieux.
      const businessMessage =
        apiError.code !== undefined
          ? businessErrorMessage(apiError.code)
          : null;
      setError("root.server", {
        message: businessMessage ?? apiError.detail,
      });
    }
  }
}
