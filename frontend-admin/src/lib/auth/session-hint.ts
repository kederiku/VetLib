/**
 * Indice de session locale ("session hint") du back-office plateforme.
 *
 * POURQUOI ce drapeau : la session vit dans des cookies HttpOnly que le
 * JavaScript ne peut PAS lire (c'est voulu, protection XSS). Le frontend
 * ne peut donc savoir si une session existe qu'en interrogeant l'API
 * (GET /me). Or, pour un simple visiteur qui arrive sur /login sans
 * jamais s'être connecté, cette vérification produit systématiquement un
 * 401 sur /me PUIS un 401 sur /refresh (tentative silencieuse du
 * mutator) : deux erreurs rouges dans la console à chaque chargement,
 * pour rien. Ce module pose un drapeau dans localStorage au login et le
 * retire au logout : le GuestGuard ne lance la vérification que si le
 * drapeau est présent.
 *
 * IMPORTANT : ce drapeau est un INDICE, pas une vérité. Les cookies
 * HttpOnly restent la seule source d'autorité sur la session (le backend
 * tranche à chaque requête). Le drapeau peut être faux dans les deux
 * sens sans casser l'app :
 * - drapeau présent mais cookies expirés -> /me échoue, l'AuthGuard
 *   resynchronise (clearSessionHint) et redirige vers /login ;
 * - cookies valides mais drapeau absent (localStorage purgé) -> le
 *   formulaire de login s'affiche, se reconnecter fonctionne (le backend
 *   réémet simplement de nouveaux cookies).
 *
 * Chaque accès à localStorage est dans un try/catch : en navigation
 * privée Safari (anciennes versions) ou si l'utilisateur bloque le
 * stockage, localStorage lève une exception ; on se comporte alors comme
 * si le drapeau n'existait pas. Côté SSR (pas de window), toutes les
 * fonctions sont des no-op.
 */

/** Clé localStorage : préfixée vetolib_admin pour rester lisible dans les
 * outils de développement. Le cloisonnement, lui, est automatique :
 * localStorage est isole par ORIGINE COMPLETE (schema + hote + port), les
 * trois applications de developpement ont donc chacune le sien meme sur
 * localhost -- contrairement aux cookies, qui ignorent le port. */
const SESSION_HINT_KEY = "vetolib_admin_session_hint";

/** Lit l'indice : true si un login a posé le drapeau sur ce navigateur. */
export function getSessionHint(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SESSION_HINT_KEY) === "1";
  } catch {
    // Stockage inaccessible : on suppose "pas de session connue".
    return false;
  }
}

/** Pose le drapeau (à appeler après un login réussi). */
export function setSessionHint(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SESSION_HINT_KEY, "1");
  } catch {
    // Stockage inaccessible : tant pis, le visiteur verra juste les 401
    // de vérification au prochain passage sur /login. Rien ne casse.
  }
}

/** Retire le drapeau (logout, ou session constatée invalide). */
export function clearSessionHint(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    // Stockage inaccessible : ignorer, voir setSessionHint.
  }
}
