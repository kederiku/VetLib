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
 * transverse (base URL, cookies d'auth, parsing de la réponse, rafraîchis-
 * sement silencieux du token, transformation des erreurs) se règle ici une
 * seule fois, jamais dans les composants.
 */
import { apiErrorFromBody } from "@/lib/api/errors";

// NEXT_PUBLIC_* : seules variables d'env exposées au navigateur par
// Next.js (inlinées au build). Fallback localhost:8000 = backend en dev.
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// URL de refresh EN DUR, volontairement. Deux raisons :
// 1. Importer getRefreshTokenUrl() depuis le code généré créerait un cycle
//    d'imports (le généré importe déjà ce mutator) ;
// 2. Le cookie vetolib_refresh est émis avec Path=/api/v1/auth/refresh :
//    le navigateur ne le joint QUE sur cette URL exacte. La figer ici rend
//    ce contrat visible et intouchable par une régénération Orval.
const REFRESH_URL = "/api/v1/auth/refresh";

// Routes d'auth EXCLUES du rafraîchissement silencieux : un 401 sur ces
// endpoints est une réponse "normale" (mauvais mot de passe, session déjà
// close, refresh token expiré) et non le signe d'un access token périmé.
// Tenter un refresh sur un 401 de /refresh bouclerait à l'infini.
// /api/v1/auth/me n'y figure PAS : son 401 doit déclencher le refresh
// (c'est même le cas le plus courant : retour sur l'app après > 15 min).
const NO_REFRESH_URLS = [
  "/api/v1/auth/login",
  "/api/v1/auth/refresh",
  "/api/v1/auth/logout",
];

// Mutex module-level : promesse du refresh EN COURS, null sinon.
// Pourquoi un mutex : au chargement d'une page, plusieurs requêtes partent
// en parallèle ; si l'access token est périmé, elles reçoivent TOUTES un
// 401 en même temps. Sans mutex, chacune lancerait SON refresh, et comme
// le backend fait tourner le refresh token (rotation), les refresh
// concurrents s'invalideraient mutuellement -> déconnexion aléatoire.
// Ici, le premier 401 crée la promesse, les autres attendent LA même.
// (Module-level est sans danger côté client : un seul utilisateur par
// navigateur ; et côté SSR ce code de refresh n'est jamais atteint car
// les Server Components n'appellent pas l'API authentifiée.)
let refreshPromise: Promise<boolean> | null = null;

/**
 * Tente de rafraîchir la session via le cookie vetolib_refresh.
 * Résout true si le backend a réémis des cookies (statut < 400).
 * Partagée entre tous les 401 concurrents grâce au mutex ci-dessus.
 */
const refreshSession = (): Promise<boolean> => {
  if (refreshPromise === null) {
    refreshPromise = fetch(`${BASE_URL}${REFRESH_URL}`, {
      method: "POST",
      // Indispensable : envoie le cookie vetolib_refresh et accepte les
      // nouveaux cookies Set-Cookie de la réponse (rotation des tokens).
      credentials: "include",
    })
      .then((response) => response.ok)
      // Panne réseau pendant le refresh = échec, pas une exception : on
      // laisse la requête d'origine échouer proprement avec son 401.
      .catch(() => false)
      .finally(() => {
        // Remise à null : le PROCHAIN 401 (dans 15 min) relancera un
        // refresh au lieu de réutiliser une promesse déjà résolue.
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

/**
 * Désérialise le corps de la réponse selon son Content-Type.
 *
 * On ne peut pas appeler response.json() aveuglément : certaines routes
 * renvoient du PDF (factures du contexte billing), du texte brut, ou
 * RIEN du tout (204 No Content du logout). Le generic T est une promesse
 * faite au code généré (qui connaît le vrai type via l'OpenAPI), pas une
 * vérification à l'exécution.
 */
const getBody = async <T>(response: Response): Promise<T> => {
  // 204 = "No Content" : par définition pas de corps. Appeler .json()
  // dessus lèverait une SyntaxError sur une chaîne vide.
  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type");

  if (contentType?.includes("application/json")) {
    // Certains serveurs annoncent du JSON mais renvoient un corps vide
    // (Content-Length: 0). On lit d'abord le texte pour s'en protéger.
    const text = await response.text();
    return (text === "" ? undefined : JSON.parse(text)) as T;
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
 *
 * Cycle de vie d'un appel :
 * 1. fetch vers BASE_URL + url avec cookies ;
 * 2. si 401 sur une route non-auth : refresh silencieux partagé, puis
 *    UNE seule nouvelle tentative de la requête d'origine ;
 * 3. statut >= 400 : throw ApiError. Jeter (et non retourner) l'erreur
 *    est le CONTRAT de TanStack Query : une promesse rejetée fait passer
 *    la query/mutation en état "error" (isError, onError, retry...) ;
 *    une promesse résolue serait considérée comme un succès ;
 * 4. succès : retour { status, data, headers } attendu par le généré.
 */
export const customFetch = async <T>(
  url: string,
  options: RequestInit,
): Promise<T> => {
  // Orval fournit une URL relative (/api/v1/...), on la préfixe car en dev
  // le frontend (:3001) et l'API (:8000) sont des origines différentes.
  const doFetch = () =>
    fetch(`${BASE_URL}${url}`, {
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

  let response = await doFetch();

  // Rafraîchissement silencieux : un 401 sur une route "métier" signifie
  // presque toujours que l'access token (15 min) a expiré alors que le
  // refresh token (7 j) est encore bon. On tente UN refresh puis UN
  // rejeu ; si le rejeu échoue encore, on laisse l'erreur remonter
  // (l'AuthGuard redirigera vers /login). Jamais de deuxième rejeu :
  // ce serait une boucle infinie si le compte est réellement invalide.
  if (response.status === 401 && !NO_REFRESH_URLS.includes(url)) {
    const refreshed = await refreshSession();
    if (refreshed) {
      response = await doFetch();
    }
  }

  const data = await getBody<unknown>(response);

  // Contrat TanStack Query : toute réponse d'erreur devient une promesse
  // REJETÉE, porteuse d'un ApiError normalisé (voir errors.ts) que les
  // formulaires savent décoder (code métier, erreurs de validation 422).
  if (response.status >= 400) {
    throw apiErrorFromBody(response.status, data);
  }

  // Forme { status, data, headers } imposée par le contrat Orval ; le cast
  // en T est assumé : le code généré retape la valeur correctement.
  return { status: response.status, data, headers: response.headers } as T;
};
