# VetoLib — Guide pour les sessions Claude

SaaS B2B2C de gestion de cliniques vétérinaires (type Doctolib). **Multi-tenant** par `clinic_id` avec **RLS PostgreSQL** — d'où le rôle DB applicatif non-superuser `vetolib_app` (NOBYPASSRLS) distinct du superuser réservé aux migrations.

## Architecture

Hexagonale (ports & adapters) + DDD, organisation « contexte d'abord » : `backend/src/vetolib/<contexte>/{domain,application,infrastructure,presentation}`.

Bounded contexts : `identity` (implémenté : clinics, users, auth JWT), `patients`, `scheduling`, `billing` (squelettes vides à implémenter sur le même modèle qu'`identity`).

- `domain/` : entités dataclasses pures, value objects, erreurs, événements, ports repository. **Zéro import framework.**
- `application/` : use cases, DTOs frozen, ports (UoW, PasswordHasher, TokenProvider, Clock).
- `infrastructure/` : modèles SQLAlchemy 2.0 async, repos concrets, adapters (pwdlib/Argon2, PyJWT, TaskIQ).
- `presentation/` : routeurs FastAPI, schémas Pydantic v2, dépendances DI.
- `shared/` : mêmes couches, éléments transverses (Base + mixins DB, UoW, outbox, error handlers, /healthz).

## Monorepo

```
docker-compose.yml  docker/  backend/  frontend-b2c/ (:3000)  frontend-b2b/ (:3001)  documentation/ (:3002)
```

## Conventions

- UUID pour toutes les PK ; **soft deletes** (`deleted_at`, jamais de DELETE) ; pattern **Outbox** (`outbox_events` + relais TaskIQ) pour tout effet de bord asynchrone.
- Auth : JWT double token en **cookies HttpOnly**, TROIS espaces INDÉPENDANTS cloisonnés par le claim `kind`, exigé **sans aucune tolérance** (un jeton copié d'un espace à l'autre est rejeté) :
  staff B2B (`kind=staff`, `/api/v1/auth/*`, cookies `vetolib_access` 15 min path `/` + `vetolib_refresh` 7 j path `/api/v1/auth/refresh`),
  propriétaires B2C (`kind=owner`, `/api/v1/owner/auth/*` + fiche `PUT /api/v1/owner/profile`, cookies `vetolib_owner_access`/`vetolib_owner_refresh` path `/api/v1/owner/auth/refresh`) et
  **plateforme** (`kind=platform`, back-office des fondateurs, `/api/v1/admin/*`, table `platform_admins`, cookies `vetolib_admin_access` path `/api/v1/admin` + `vetolib_admin_refresh` 12 h path `/api/v1/admin/auth/refresh`, tous deux `SameSite=Strict`).
  Jamais de token dans un body JSON. Le même email peut exister dans `users` (staff) ET `owners` (comptes séparés).
- **Espace plateforme** : aucune inscription publique (comptes créés par `make create-admin` uniquement), autorisation binaire (ni rôle ni `perms`), compte relu en base à chaque requête, dépendance d'auth posée sur le **routeur** et non route par route. C'est le seul espace qui lit à travers les tenants, donc hors RLS : le test `tests/integration/test_admin_routes_protected.py` énumère toutes les routes `/api/v1/admin/*` et exige un 401 sans cookie — ne jamais le désactiver, et ne jamais poser de route admin hors d'un routeur protégé. Voir ADR-0013.
- **Suspendre ≠ supprimer** : `clinics.is_active` / `owners.is_active` gèlent un accès de façon réversible ; `deleted_at` reste l'effacement définitif. Ne pas confondre — les index uniques d'email étant partiels (`WHERE deleted_at IS NULL`), un soft delete libère l'adresse et rend la réactivation impossible.
- Routes FastAPI : toujours un `operation_id` explicite (noms des hooks Orval).
- UoW : `system_uow()` (flux pré-tenant : login, register) vs `tenant_uow(clinic_id)` (`SET LOCAL ROLE vetolib_app` + `SET LOCAL app.clinic_id`).
- SQLAlchemy : rester sur 2.0.x (< 2.1) ; TypeScript : rester sur 6.x (TS 7 casse typescript-eslint).
- Tests d'intégration : testcontainers PostgreSQL (jamais SQLite — RLS/JSONB/SET LOCAL non émulables).
- **Commentaires pédagogiques** : tout le code (backend, frontends, Docker, tests) est commenté **en français, pour qu'un novice comprenne son fonctionnement** — docstring de module (rôle du fichier dans l'architecture), docstrings de classes/fonctions, et le *pourquoi* des choix (RLS, outbox, cookies HttpOnly…). Maintenir ce niveau sur tout code nouveau ou modifié. Contrainte ruff dans les commentaires Python : ponctuation ASCII (pas de tirets cadratins ni guillemets typographiques ; lettres accentuées OK), lignes ≤ 100.
- **Frontends : utilise les composants `shadcn/ui` le plus possible et du style Tailwind.** Pas de CSS maison; les nouveaux composants s'ajoutent via la CLI shadcn dans `src/components/ui/`. Attention : la CLI ECRASE les fichiers `ui/` existants (elle emporte leurs docstrings francaises) et genere un `hooks/use-mobile.ts` refuse par les regles `react-hooks` du projet -- verifier `git status` apres chaque `shadcn add` et restaurer ce qui ne devait pas bouger.
- **Les deux portails partagent la meme coquille** : `AppShell` + `AppSidebar` + `SiteHeader` + `UserMenu`, avec `lib/navigation.ts` comme source unique des entrees de menu et du titre de page, et `components/shared/` pour `PageContainer` / `PageHeader` / `EmptyState` / `ErrorState`. Un ecran ne fixe JAMAIS sa propre largeur ni son propre `<main>` (le `SidebarInset` en est deja un). Regle des retours : **inline** quand l'utilisateur doit AGIR (erreur de champ, dialogue qui reste ouvert), **toast** quand on l'informe que c'est fait ou que ca a echoue.
- **Documentation** : site Docusaurus 3 dans `documentation/` (TypeScript, français, *docs-only* — pas de blog), publié sur <https://kederiku.github.io/VetLib/> à chaque merge sur `main`. La page de référence de l'API est produite au build par `redocusaurus` depuis `backend/openapi.json` : **ne jamais l'écrire à la main**, exactement comme le client Orval. Écrire en `.md` (CommonMark, `markdown.format: 'detect'`) sauf besoin réel de JSX. Le dépôt étant **public**, le site l'est aussi : aucun secret, aucune URL interne, aucun nom de client réel dans les pages. Toute modification de comportement visible ou du contrat d'API s'accompagne de la mise à jour de la page correspondante.

## Commandes

Le **Makefile racine** est le point d'entrée unique de toutes les commandes du projet — Claude est autorisé à utiliser librement ses cibles (`make help` pour la liste ; il délègue à `backend/Makefile`).

- `make up` : infra + api + worker (Docker). Frontends **hors Docker** en dev : `make dev-b2c` / `make dev-b2b`.
- Deux fichiers d'env distincts (`make env` copie les deux) : `.env` racine = interpolation docker-compose (hostnames Docker) ; `backend/.env` = backend lancé hors Docker (`make dev-api`, alembic, tâches locales — URLs localhost).
- `make migrate` : migrations Alembic (connectées via `ALEMBIC_DATABASE_URL`, superuser).
- `make check` : toute la qualité sans Docker (ruff, mypy, tests unit, ESLint, tsc) ; en ciblé : `make lint typecheck test-unit` (backend) ou `make lint-front typecheck-front`.
- Après tout changement d'endpoint : `make generate-api` (API démarrée sur :8000) — régénère le client Orval des **2** frontends. La CI le vérifie (job `api-client-drift`) : un oubli bloque la PR.
- **Ne jamais éditer `src/lib/api/generated/`** (sortie Orval, committée).
- `make check-front` impose l'ordre **lint → build → typecheck → test** : `tsc` a besoin de `next-env.d.ts` et `.next/types/`, générés par le build et gitignorés. Ne jamais lancer `typecheck-front` seul sur un dépôt fraîchement cloné.
- `make docs` : site de documentation en local sur :3002 (`make docs-build`, `make docs-serve`). Ces cibles régénèrent d'abord `backend/openapi.json` — sans lui, le site perd sa référence d'API.
- `make check-docs` : Prettier + `tsc` + build Docusaurus, soit exactement le job CI `documentation` ; inclus dans `make check`. Le build **échoue** sur un lien interne ou une ancre morts (`onBrokenLinks`/`onBrokenAnchors` réglés sur `throw`) : c'est le principal filet de la doc. Le site ne fait PAS l'ordre build-avant-typecheck des frontends — son `tsconfig.json` n'a pas cette contrainte.

## Contribution — `main` est protégée

Le push direct sur `main` est **refusé** par un ruleset GitHub. Toute
modification passe par une branche + une PR, fusionnable seulement si la CI est
verte (0 approbation requise, le projet a un seul contributeur).

```bash
git switch -c feat/ma-fonctionnalite
make check                       # à lancer AVANT de pousser
git push -u origin feat/ma-fonctionnalite
gh pr create --fill
gh pr merge --auto --squash      # fusion automatique dès que la CI passe
```

- Le seul check requis est le job **`gate`** de `.github/workflows/ci.yml`. **Ne jamais le renommer** : un check requis introuvable bloque toutes les PR sans message d'erreur (procédure de renommage dans le README).
- Ajouter un job à la CI implique de l'ajouter à la liste `needs:` de `gate`, sinon son échec passerait inaperçu. **Exception : les jobs d'après-merge** (`publier les images`, `publier la documentation`), qui dépendent de `gate` et sont volontairement absents de ses `needs:` — ils sont `skipped` sur les PR, et un `skipped` dans `needs:` fait échouer le gate.
- Déblocage d'urgence (CI cassée) : désactiver temporairement le ruleset via `gh api --method PUT repos/kederiku/VetLib/rulesets/<id>` avec `{"enforcement":"disabled"}`, puis le réactiver. Il n'y a volontairement pas de contournement silencieux.
- Reproduire la CI en local : `make check` (sans Docker), `make check-all` (avec), `make coverage` (backend), `make coverage-front` (frontends), `make audit`.
- Les seuils de couverture sont mesurés puis posés 2 points en dessous (3 pour les branches) : `fail_under` dans `backend/pyproject.toml`, `coverage.thresholds` dans les `vitest.config.mts`. Ne jamais baisser un seuil dans la PR qui l'a cassé — c'est un commit dédié, daté et commenté.
