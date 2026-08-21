/**
 * En-tête standard d'une page : titre + description + zone d'actions.
 *
 * Remplace les <h1> copiés-collés des écrans (même classe, mêmes
 * espacements) et donne une place CONVENUE à l'action principale de la
 * page : en haut à droite, alignée sur le titre. L'utilisateur n'a plus
 * à chercher le bouton "Prendre rendez-vous" tantôt au-dessus de la
 * liste, tantôt dans un état vide.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  /** Bouton(s) d'action principale, rendus à droite du titre. */
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description !== undefined && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions !== undefined && (
        <div className="flex items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
