# =============================================================================
# Makefile racine VetoLib — point d'entrée unique de TOUTES les commandes du projet.
#
# Pour un novice, comment lire ce fichier :
#   - Chaque bloc "nom-cible:" est une commande qu'on lance avec `make nom-cible`.
#   - Les lignes sous une cible commencent OBLIGATOIREMENT par une tabulation
#     (pas des espaces !) : c'est la syntaxe de make.
#   - Le texte après "##" sur la ligne d'une cible est sa description : elle est
#     affichée par `make help` (la cible par défaut, voir .DEFAULT_GOAL).
#   - `make -C backend xxx` signifie "lance `make xxx` mais depuis le dossier
#     backend/" : ce Makefile racine délègue ainsi au Makefile du backend.
#
# Démarrage rapide :
#   make env       (copie les fichiers d'environnement d'exemple)
#   make up        (démarre postgres, redis, minio, api, worker via Docker)
#   make migrate   (applique les migrations de base de données)
#   make install   (dépendances backend + frontends)
#   make dev-b2c   (frontend propriétaires d'animaux, http://localhost:3000)
#   make dev-b2b   (frontend cliniques,               http://localhost:3001)
# =============================================================================

# Dossiers des sous-projets, pour éviter de répéter les chemins partout.
BACKEND := backend
B2C     := frontend-b2c
B2B     := frontend-b2b

# Sans argument, `make` affiche l'aide au lieu d'exécuter la première cible.
.DEFAULT_GOAL := help

# .PHONY déclare que ces cibles ne produisent PAS de fichier du même nom :
# sans cela, un fichier nommé "test" ou "install" empêcherait la cible de tourner.
.PHONY: help env install up up-full down down-volumes ps logs restart \
        dev-api worker scheduler dev-b2c dev-b2b \
        migrate revision openapi generate-api \
        lint format typecheck test test-unit test-integration \
        lint-front typecheck-front check

# -----------------------------------------------------------------------------
# Aide
# -----------------------------------------------------------------------------

help: ## Affiche la liste des commandes disponibles
	@echo ""
	@echo "VetoLib — commandes disponibles :"
	@echo ""
	@grep -hE '^[a-zA-Z0-9_-]+:.*## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*## "} {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo ""

# -----------------------------------------------------------------------------
# Environnement et installation
# -----------------------------------------------------------------------------

env: ## Copie les .env d'exemple s'ils n'existent pas déjà (cp -n = ne jamais écraser)
	cp -n .env.example .env || true
	cp -n $(BACKEND)/.env.example $(BACKEND)/.env || true
	@echo "Fichiers .env prêts (racine = Docker, backend/.env = hors Docker)."

install: ## Installe toutes les dépendances (backend uv + npm des 2 frontends)
	$(MAKE) -C $(BACKEND) install
	cd $(B2C) && npm install
	cd $(B2B) && npm install

# -----------------------------------------------------------------------------
# Infrastructure Docker (postgres, redis, minio, api :8000, worker)
# Les frontends tournent HORS Docker en dev (voir dev-b2c / dev-b2b).
# -----------------------------------------------------------------------------

up: ## Démarre l'infra + l'API + le worker en arrière-plan
	docker compose up -d

up-full: ## Démo full-stack : idem `up` + les 2 frontends conteneurisés
	docker compose --profile frontend up -d

down: ## Arrête tous les conteneurs (les données sont conservées)
	docker compose down

down-volumes: ## Arrête ET SUPPRIME les volumes : toutes les données locales sont perdues !
	docker compose down -v

ps: ## Liste l'état des conteneurs du projet
	docker compose ps

logs: ## Suit les logs de tous les conteneurs (Ctrl+C pour quitter) ; `make logs s=api` pour un seul
	docker compose logs -f $(s)

restart: ## Redémarre l'API et le worker (après un changement de config par exemple)
	docker compose restart api worker

# -----------------------------------------------------------------------------
# Lancement en local, hors Docker (pratique pour le debug avec rechargement auto)
# Nécessite backend/.env (fait par `make env`) et l'infra démarrée (`make up`).
# -----------------------------------------------------------------------------

dev-api: ## API FastAPI en local avec rechargement auto (http://localhost:8000)
	$(MAKE) -C $(BACKEND) dev

worker: ## Worker TaskIQ en local (traite les tâches asynchrones de l'outbox)
	$(MAKE) -C $(BACKEND) worker

scheduler: ## Scheduler TaskIQ en local (déclenche les tâches périodiques)
	$(MAKE) -C $(BACKEND) scheduler

dev-b2c: ## Frontend B2C (propriétaires d'animaux) sur http://localhost:3000
	cd $(B2C) && npm run dev

dev-b2b: ## Frontend B2B (cliniques) sur http://localhost:3001
	cd $(B2B) && npm run dev

# -----------------------------------------------------------------------------
# Base de données (migrations Alembic, connectées en superuser — voir CLAUDE.md)
# -----------------------------------------------------------------------------

migrate: ## Applique toutes les migrations en attente sur la base
	$(MAKE) -C $(BACKEND) migrate

revision: ## Crée un fichier de migration vide : make revision m="ma description"
	@test -n "$(m)" || (echo 'Usage : make revision m="description de la migration"' && exit 1)
	$(MAKE) -C $(BACKEND) revision m="$(m)"

# -----------------------------------------------------------------------------
# Client API TypeScript (Orval génère les hooks TanStack Query depuis l'OpenAPI).
# À relancer après TOUT changement d'endpoint backend, dans LES DEUX frontends.
# -----------------------------------------------------------------------------

openapi: ## Exporte le schéma OpenAPI du backend dans backend/openapi.json
	$(MAKE) -C $(BACKEND) openapi

generate-api: ## Régénère les clients API des 2 frontends (l'API doit tourner sur :8000)
	cd $(B2C) && npm run generate:api
	cd $(B2B) && npm run generate:api

# -----------------------------------------------------------------------------
# Qualité backend (aucune de ces cibles ne nécessite Docker, sauf test-integration)
# -----------------------------------------------------------------------------

lint: ## Vérifie le style du code Python (ruff check + format --check)
	$(MAKE) -C $(BACKEND) lint

format: ## Reformate le code Python et corrige les erreurs de style corrigeables
	$(MAKE) -C $(BACKEND) format

typecheck: ## Vérifie les types Python (mypy en mode strict)
	$(MAKE) -C $(BACKEND) typecheck

test: ## Tous les tests backend (unitaires + intégration ; Docker requis)
	$(MAKE) -C $(BACKEND) test

test-unit: ## Tests unitaires seulement (rapides, sans Docker)
	$(MAKE) -C $(BACKEND) test-unit

test-integration: ## Tests d'intégration (PostgreSQL réel via testcontainers, Docker requis)
	$(MAKE) -C $(BACKEND) test-integration

# -----------------------------------------------------------------------------
# Qualité frontends
# -----------------------------------------------------------------------------

lint-front: ## ESLint sur les 2 frontends
	cd $(B2C) && npm run lint
	cd $(B2B) && npm run lint

typecheck-front: ## Vérification TypeScript (tsc --noEmit) sur les 2 frontends
	cd $(B2C) && npm run typecheck
	cd $(B2B) && npm run typecheck

# -----------------------------------------------------------------------------
# Raccourci qualité globale
# -----------------------------------------------------------------------------

check: lint typecheck test-unit lint-front typecheck-front ## Toute la qualité sans Docker (backend + frontends)
	@echo "Toutes les vérifications sont passées."
