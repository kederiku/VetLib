/**
 * Traduction des erreurs serveur vers les formulaires react-hook-form.
 *
 * Quand l'API rejette une soumission, l'erreur doit apparaître AU BON
 * ENDROIT : sous le champ concerné si on sait lequel (422 de validation,
 * email déjà pris), sinon en bandeau global au-dessus du bouton (erreur
 * "root"). Cette fonction est l'unique traducteur ApiError -> setError,
 * partagée par tous les formulaires du portail : les libellés français
 * des codes métier vivent ici, à un seul endroit.
 *
 * Le module expose AUSSI messageForApiError, pour les mutations SANS
 * formulaire (confirmer/annuler un rendez-vous depuis l'agenda...) : même
 * table de libellés, mais le résultat est une simple chaîne à afficher
 * dans une Alert, pas un setError.
 */
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import { getApiError } from "@/lib/api/errors";

// Message générique quand le serveur n'a JAMAIS répondu (backend éteint,
// panne réseau, CORS) : il n'y a rien de plus précis à dire.
const NETWORK_ERROR_MESSAGE =
  "Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.";

// Codes métier stables du backend -> libellés français destinés à
// l'utilisateur. La table est consultée par applyServerErrors (bandeau
// root des formulaires) ET par messageForApiError (mutations sans
// formulaire) : un libellé se corrige à UN seul endroit.
// N'y figurent PAS les codes attribuables à un champ précis
// (identity.email_already_exists), traités à part dans le switch.
const API_ERROR_MESSAGES: Record<string, string> = {
  "identity.invalid_credentials":
    // Message volontairement flou (email OU mot de passe) : ne jamais
    // révéler si un compte existe pour une adresse donnée.
    "Email ou mot de passe incorrect.",
  "identity.user_inactive": "Ce compte est désactivé.",
  "scheduling.slot_already_booked":
    "Ce créneau est déjà occupé. Choisissez un autre horaire.",
  "scheduling.invalid_transition":
    "Ce rendez-vous a déjà changé d'état. Actualisez l'agenda.",
  "scheduling.slot_unavailable":
    "Ce créneau est en dehors des horaires du praticien.",
  "scheduling.cancellation_too_late":
    "Le délai d'annulation est dépassé pour ce rendez-vous.",
  "scheduling.resource_not_found":
    "Ce praticien est introuvable. Actualisez la page.",
  "scheduling.appointment_type_not_found":
    "Ce type de rendez-vous est introuvable. Actualisez la page.",
  "scheduling.appointment_not_found":
    "Ce rendez-vous est introuvable. Actualisez l'agenda.",
  "patients.pet_not_found": "Cet animal est introuvable.",
};

/**
 * Libellé français d'une erreur de mutation SANS formulaire.
 *
 * Trois cas, du plus au moins précis : serveur injoignable -> message
 * réseau générique ; code métier connu -> libellé de la table ; sinon le
 * detail brut du backend (faute de mieux, mais jamais un écran muet).
 */
export function messageForApiError(error: unknown): string {
  const apiError = getApiError(error);
  if (apiError === null) {
    return NETWORK_ERROR_MESSAGE;
  }
  const message =
    apiError.code !== undefined ? API_ERROR_MESSAGES[apiError.code] : undefined;
  return message ?? apiError.detail;
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
    setError("root.server", { message: NETWORK_ERROR_MESSAGE });
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
      // l'erreur arrive donc forcément du serveur. Elle aussi est attribuable
      // à un champ précis.
      setError("password" as Path<T>, {
        message:
          "Ce mot de passe figure dans une fuite de données connue. Choisissez-en un autre.",
      });
      return;
    default:
      // Tous les autres codes vont en bandeau global : le libellé vient
      // de la table API_ERROR_MESSAGES (via messageForApiError), avec le
      // detail brut du backend en repli pour un code inconnu.
      setError("root.server", { message: messageForApiError(apiError) });
  }
}
