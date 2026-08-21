/**
 * Indicateur de robustesse du mot de passe (écrans d'inscription).
 *
 * Volontairement SOBRE et sans dépendance (pas de zxcvbn) : trois niveaux
 * calculés sur la seule LONGUEUR, alignés sur la politique backend.
 *
 * Pourquoi la longueur seule : la politique n'impose aucune règle de
 * composition (voir lib/auth/password-policy.ts et NIST SP 800-63B). Afficher
 * des critères « majuscule », « chiffre », « caractère spécial » — même non
 * bloquants — laisserait croire qu'ils sont exigés et pousserait vers des mots
 * de passe courts et tarabiscotés, exactement ce que la politique cherche à
 * éviter. On encourage donc la phrase de passe, qui gagne sur les deux
 * tableaux : plus longue et plus facile à retenir.
 *
 * Le composant remplace la FieldDescription « Au moins N caractères » : tant
 * que le champ est vide, il affiche cette consigne ; dès la première frappe,
 * il bascule sur l'évaluation.
 *
 * Ce qu'il ne dit PAS : si le mot de passe figure dans une fuite connue. Cette
 * vérification demande le corpus Have I Been Pwned et n'a lieu qu'au moment de
 * la soumission, côté serveur.
 */
import {
  PASSWORD_MIN_LENGTH,
  STRONG_PASSWORD_LENGTH,
} from "@/lib/auth/password-policy";

/** Niveau de force : 0 = champ vide (neutre), 1 à 3 sinon. */
function strengthLevel(password: string): 0 | 1 | 2 | 3 {
  if (password.length === 0) return 0;
  // En dessous du minimum backend : refusé de toute façon.
  if (password.length < PASSWORD_MIN_LENGTH) return 1;
  // "Solide" : nettement au-delà du minimum. Aucun autre critère — un mot de
  // passe de 20 caractères tout en minuscules est plus solide qu'un
  // "Passw0rd!" de 9, et bien plus facile à retenir.
  if (password.length >= STRONG_PASSWORD_LENGTH) return 3;
  return 2;
}

// Libellé et couleur de texte par niveau. Le niveau 0 reprend la consigne de
// la politique (rôle de l'ancienne FieldDescription).
const LEVEL_TEXT: Record<0 | 1 | 2 | 3, { label: string; className: string }> =
  {
    0: {
      label: `Au moins ${PASSWORD_MIN_LENGTH} caractères.`,
      className: "text-muted-foreground",
    },
    1: { label: "Trop court", className: "text-destructive" },
    2: { label: "Correct", className: "text-muted-foreground" },
    3: { label: "Solide", className: "text-muted-foreground" },
  };

export function PasswordStrengthHint({ password }: { password: string }) {
  const level = strengthLevel(password);
  const { label, className } = LEVEL_TEXT[level];

  // Couleur des barres : les barres "remplies" (index < level) prennent
  // bg-destructive au niveau 1, bg-brand aux niveaux 2 et 3 ; les autres
  // restent neutres (bg-muted). Champ vide : tout reste neutre.
  const filledClass = level === 1 ? "bg-destructive" : "bg-brand";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1.5" aria-hidden>
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className={`h-1 flex-1 rounded-full ${
              index < level ? filledClass : "bg-muted"
            }`}
          />
        ))}
      </div>
      {/* aria-live="polite" : le lecteur d'écran annonce le changement de
          niveau sans interrompre la frappe en cours. */}
      <p className={`text-xs ${className}`} aria-live="polite">
        {label}
      </p>
      {/* Conseil permanent, hors aria-live : il ne change jamais, l'annoncer
          à chaque frappe serait du bruit. */}
      <p className="text-xs text-muted-foreground">
        Le plus sûr et le plus facile à retenir reste une phrase entière, par
        exemple «&nbsp;mon chat rex adore les croquettes&nbsp;».
      </p>
    </div>
  );
}
