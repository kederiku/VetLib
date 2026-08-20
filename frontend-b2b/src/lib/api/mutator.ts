/**
 * Mutator personnalisé pour le client fetch généré par Orval.
 *
 * Convention Orval (httpClient: "fetch") — voir l'exemple officiel
 * `next-app-with-fetch` : la fonction reçoit l'URL et un RequestInit,
 * et retourne un objet `{ status, data, headers }` que le code généré
 * ré-expose tel quel.
 *
 * Rôle dans l'architecture : c'est LE point de passage unique de tous les
 * appels HTTP du portail B2B vers le backend FastAPI. Toute préoccupation
 * transverse (base URL, cookies d'auth, parsing de la réponse) se règle
 * ici une seule fois, jamais dans les composants.
 */

// NEXT_PUBLIC_* : seules variables d'env exposées au navigateur par
// Next.js (inlinées au build). Fallback localhost:8000 = backend en dev.
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/**
 * Désérialise le corps de la réponse selon son Content-Type.
 *
 * On ne peut pas appeler response.json() aveuglément : certaines routes
 * renvoient du PDF (factures du contexte billing) ou du texte brut. Le
 * generic T est une promesse faite au code généré (qui connaît le vrai
 * type via l'OpenAPI), pas une vérification à l'exécution.
 */
const getBody = async <T>(response: Response): Promise<T> => {
  const contentType = response.headers.get("content-type");

  if (contentType?.includes("application/json")) {
    return response.json() as Promise<T>;
  }

  if (contentType?.includes("application/pdf")) {
    return response.blob() as Promise<T>;
  }

  return response.text() as Promise<T>;
};

/**
 * Wrapper fetch injecté par Orval dans chaque hook généré.
 *
 * Note : pas de header Authorization ici, et c'est voulu. L'auth VetoLib
 * repose sur des cookies HttpOnly que JavaScript ne peut pas lire (donc
 * pas voler via XSS) ; c'est le navigateur qui les joint tout seul.
 */
export const customFetch = async <T>(
  url: string,
  options: RequestInit,
): Promise<T> => {
  // Orval fournit une URL relative (/api/v1/...), on la préfixe car en dev
  // le frontend (:3001) et l'API (:8000) sont des origines différentes.
  const response = await fetch(`${BASE_URL}${url}`, {
    ...options,
    // Cookies JWT HttpOnly (vetolib_access / vetolib_refresh)
    // credentials: "include" est OBLIGATOIRE en cross-origin, sinon le
    // navigateur n'envoie ni ne stocke ces cookies et toute requête
    // authentifiée répondrait 401. (Jamais de token en body JSON.)
    credentials: "include",
    headers: {
      // Défaut JSON ; ...options.headers ensuite pour qu'un endpoint
      // puisse le surcharger (upload multipart par exemple).
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await getBody<T>(response);

  // Forme { status, data, headers } imposée par le contrat Orval ; le cast
  // en T est assumé : le code généré retape la valeur correctement.
  return { status: response.status, data, headers: response.headers } as T;
};
