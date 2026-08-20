/**
 * Mutator personnalisé pour le client fetch généré par Orval.
 *
 * Convention Orval (httpClient: "fetch") — voir l'exemple officiel
 * `next-app-with-fetch` : la fonction reçoit l'URL et un RequestInit,
 * et retourne un objet `{ status, data, headers }` que le code généré
 * ré-expose tel quel.
 */
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
  const response = await fetch(`${BASE_URL}${url}`, {
    ...options,
    // Cookies JWT HttpOnly (vetolib_access / vetolib_refresh)
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await getBody<T>(response);

  return { status: response.status, data, headers: response.headers } as T;
};
