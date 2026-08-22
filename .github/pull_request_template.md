## Objectif

<!-- Ce que fait cette PR et pourquoi. Si une issue existe : Closes #123 -->

## Type de changement

- [ ] `feat` — nouvelle fonctionnalité
- [ ] `fix` — correction de bug
- [ ] `refactor` — réorganisation sans changement de comportement
- [ ] `docs` / `chore` / `ci`

## Vérifications

- [ ] `make check` passe en local (ruff, mypy, tests unitaires, ESLint, build, tsc, Vitest, build de la doc)
- [ ] `make test-integration` passe si le backend ou le schéma a changé
- [ ] Migration Alembic ajoutée si un modèle SQLAlchemy a changé — **et un seul head**
- [ ] `make generate-api` relancé et **les trois** clients Orval committés, si un endpoint a changé
- [ ] Documentation mise à jour dans `documentation/docs/` si le comportement visible ou le contrat d'API change
- [ ] Commentaires pédagogiques en français sur tout code nouveau ou modifié (cf. `CLAUDE.md`)
- [ ] Composants `shadcn/ui` + Tailwind côté frontend, pas de CSS maison

## Impact multi-tenant et sécurité

- [ ] Nouvelle table tenantée : colonne `clinic_id`, policy RLS `tenant_isolation`, GRANT sans DELETE
- [ ] Aucun jeton dans un corps JSON (cookies HttpOnly uniquement)
- [ ] Sans objet

<!--
Rappel : `main` est protégée. Cette PR ne pourra être fusionnée que lorsque le
check « gate » sera au vert. Pour une fusion automatique dès que la CI passe :
    gh pr merge --auto --squash
-->
