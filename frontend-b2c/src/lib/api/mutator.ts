/**
 * Mutator personnalisé pour le client fetch généré par Orval.
 *
 * Convention Orval (httpClient: "fetch") — voir l'exemple officiel
 * `next-app-with-fetch` : la fonction reçoit l'URL et un RequestInit,
 * et retourne un objet `{ status, data, headers }` que le code généré
 * ré-expose tel quel.
 *
 * Rôle dans l'architecture : c'est l'UNIQUE point de passage de tous les
 * appels HTTP émis par les hooks TanStack Query de src/lib/api/generated
 * (branché via override.mutator dans orval.config.ts). Centraliser ici la
 * base URL, les credentials et le décodage du corps évite de dupliquer cette
 * logique dans chaque hook généré.
 */
// NEXT_PUBLIC_ : seul préfixe que Next.js expose au bundle navigateur (les
// autres variables d'env restent côté serveur). Repli sur localhost:8000,
// l'API FastAPI lancée par docker compose en dev.
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Décode le corps de la réponse selon son Content-Type : JSON pour l'API,
// Blob pour les téléchargements PDF (factures du contexte billing), texte
// sinon (pages d'erreur, réponses vides...).
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

export const customFetch = async <T>(
  url: string,
  options: RequestInit,
): Promise<T> => {
  // Orval fournit des URLs relatives (ex : /api/v1/auth/login) ; on les
  // préfixe avec l'origine de l'API, différente de celle du frontend.
  const response = await fetch(`${BASE_URL}${url}`, {
    ...options,
    // Cookies JWT HttpOnly (vetolib_access / vetolib_refresh)
    // Indispensable : l'auth VetoLib repose sur des cookies HttpOnly (jamais
    // de token dans un body JSON, donc illisibles et non stockables par le
    // JS -> immunité XSS). Or fetch n'envoie PAS les cookies vers une autre
    // origine (localhost:3000 -> localhost:8000) sans credentials: "include".
    // Sans cette ligne, toute route protégée répondrait 401.
    credentials: "include",
    headers: {
      // Content-Type par défaut, que l'appelant peut écraser via
      // options.headers (placé après dans le spread).
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await getBody<T>(response);

  // Forme { status, data, headers } attendue par le code généré : il ne
  // "throw" pas sur un statut d'erreur, c'est aux appelants (ou aux types
  // générés, qui unissent les variantes 2xx/4xx) de discriminer sur status.
  // Le cast "as T" est le compromis assumé de cette convention Orval : T
  // décrit déjà cette enveloppe dans le code généré.
  return { status: response.status, data, headers: response.headers } as T;
};
