/**
 * Traduction des erreurs serveur vers les formulaires react-hook-form.
 *
 * Même rôle et même forme que dans les deux portails : une erreur d'API doit
 * apparaître AU BON ENDROIT — sous le champ concerné quand on sait lequel,
 * sinon en bandeau global au-dessus du bouton (clé `root.server`).
 *
 * Le module expose AUSSI messageForApiError, pour les mutations sans
 * formulaire (suspendre une clinique depuis un menu, par exemple) : même
 * table de libellés, mais le résultat est une simple chaîne à afficher dans
 * un toast.
 */
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import { getApiError } from "@/lib/api/errors";

// Message générique quand le serveur n'a JAMAIS répondu (backend éteint,
// panne réseau, CORS) : il n'y a rien de plus précis à dire.
const NETWORK_ERROR_MESSAGE =
  "Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.";

// Codes métier stables du backend -> libellés français. Un libellé se corrige
// à UN seul endroit. N'y figurent pas les codes attribuables à un champ
// précis, traités dans le switch plus bas.
const API_ERROR_MESSAGES: Record<string, string> = {
  "identity.invalid_credentials":
    // Message volontairement flou (email OU mot de passe) : ne jamais
    // révéler si un compte existe pour une adresse donnée.
    "Email ou mot de passe incorrect.",
  "identity.admin_inactive":
    "Cet accès administrateur a été révoqué. Contactez un autre administrateur.",
  "identity.clinic_not_found": "Cette clinique est introuvable. Actualisez la page.",
  "identity.owner_not_found": "Ce propriétaire est introuvable. Actualisez la page.",
  "identity.user_not_found": "Ce compte est introuvable. Actualisez la page.",
};

/**
 * Libellé français d'une erreur de mutation SANS formulaire.
 *
 * Trois cas, du plus au moins précis : serveur injoignable -> message réseau ;
 * code métier connu -> libellé de la table ; sinon le `detail` brut du
 * backend — faute de mieux, mais jamais un écran muet.
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
 * Applique une erreur de soumission sur le formulaire appelant.
 *
 * @param error       L'erreur attrapée dans le catch du onSubmit (unknown).
 * @param setError    Le setError du useForm appelant.
 * @param knownFields Les champs QUE CE formulaire affiche : une erreur 422 sur
 *                    un champ inconnu (évolution d'API) part dans le bandeau
 *                    global plutôt que d'être silencieusement perdue sous un
 *                    champ inexistant.
 *
 * Convention `root.server` : react-hook-form réserve les clés `root.*` aux
 * erreurs non liées à un champ ; elles se lisent via `errors.root?.server` et
 * ne bloquent PAS la re-soumission.
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  knownFields: readonly Path<T>[],
): void {
  const apiError = getApiError(error);

  if (apiError === null) {
    setError("root.server", { message: NETWORK_ERROR_MESSAGE });
    return;
  }

  // 422 : validation Pydantic champ par champ. Chaque entrée localise le
  // champ fautif via loc = ["body", "nom_du_champ"].
  if (apiError.validation !== undefined) {
    for (const validationError of apiError.validation) {
      const fieldName = String(validationError.loc[1]);
      if ((knownFields as readonly string[]).includes(fieldName)) {
        setError(fieldName as Path<T>, { message: validationError.msg });
      } else {
        setError("root.server", { message: validationError.msg });
      }
    }
    return;
  }

  switch (apiError.code) {
    case "identity.email_already_exists":
      // Erreur attribuable à UN champ précis : on la met sous ce champ.
      setError("email" as Path<T>, {
        message: "Cette adresse email est déjà utilisée.",
      });
      return;
    case "identity.password_compromised":
      setError("password" as Path<T>, {
        message:
          "Ce mot de passe figure dans une fuite de données connue. Choisissez-en un autre.",
      });
      return;
    default:
      setError("root.server", { message: messageForApiError(apiError) });
  }
}
