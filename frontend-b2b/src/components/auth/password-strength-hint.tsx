/**
 * Indicateur de force du mot de passe (inscription).
 *
 * Volontairement SOBRE et sans dépendance (pas de zxcvbn) : trois
 * niveaux calculés sur des critères simples, alignés sur la politique
 * backend (minimum 12 caractères). Le but n'est pas de mesurer
 * l'entropie exacte mais d'encourager visuellement un mot de passe plus
 * long et plus varié. Le composant remplace la FieldDescription "Au
 * moins 12 caractères" : tant que le champ est vide, il affiche cette
 * consigne ; dès la première frappe, il bascule sur l'évaluation.
 */

/** Niveau de force : 0 = champ vide (neutre), 1 à 3 sinon. */
function strengthLevel(password: string): 0 | 1 | 2 | 3 {
  if (password.length === 0) return 0;
  // En dessous du minimum backend (12) : refusé de toute façon.
  if (password.length < 12) return 1;
  // "Solide" : plus long (14+) ET mélange majuscules/minuscules ET au
  // moins un chiffre. Des critères simples, lisibles, sans regex opaque.
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  if (password.length >= 14 && hasLower && hasUpper && hasDigit) return 3;
  return 2;
}

// Libellé et couleur de texte par niveau. Le niveau 0 reprend la
// consigne de la politique (rôle de l'ancienne FieldDescription).
const LEVEL_TEXT: Record<0 | 1 | 2 | 3, { label: string; className: string }> =
  {
    0: { label: "Au moins 12 caractères.", className: "text-muted-foreground" },
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
    </div>
  );
}
