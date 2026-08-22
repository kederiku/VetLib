.PHONY: install install-ci dev worker scheduler lint format typecheck \
        test test-unit test-integration coverage check-migrations \
        migrate revision openapi create-admin

install:
	uv sync

install-ci: ## Installe STRICTEMENT ce qui est verrouille dans uv.lock (utilise par la CI)
	uv sync --locked

dev:
	uv run uvicorn vetolib.main:app --reload --port 8000

worker:
	uv run taskiq worker vetolib.worker:broker

scheduler:
	uv run taskiq scheduler vetolib.worker:scheduler

lint:
	uv run ruff check .
	uv run ruff format --check .

format:
	uv run ruff format .
	uv run ruff check --fix .

typecheck:
	uv run mypy

test:
	uv run pytest

test-unit:
	uv run pytest tests/unit

test-integration:
	uv run pytest tests/integration

migrate:
	uv run alembic upgrade head

revision:
	uv run alembic revision -m "$(m)"

create-admin: ## Cree un compte du back-office plateforme (mot de passe demande a l'invite)
	@test -n "$(email)" || { echo 'Usage : make create-admin email=prenom.nom@exemple.fr'; exit 1; }
	@# Le mot de passe n'est JAMAIS passe en argument : il serait visible
	@# dans l'historique du shell et dans `ps`. La commande le demande a
	@# l'invite (saisie masquee), ou le lit sur stdin si ce n'est pas un
	@# terminal (`pass show ... | make create-admin email=...`).
	uv run python -m vetolib.cli.create_admin --email "$(email)" \
	  $(if $(first),--first-name "$(first)") $(if $(last),--last-name "$(last)") $(args)

openapi:
	uv run python -c "import json; from vetolib.main import app; print(json.dumps(app.openapi()))" > openapi.json

coverage: ## Couverture consolidee des tests unitaires ET d'integration (Docker requis)
	@rm -f .coverage .coverage.unit .coverage.integration
	@# --cov-fail-under=0 : le seuil de pyproject.toml ne s'applique qu'au
	@# rapport consolide, pas a chaque suite prise isolement.
	COVERAGE_FILE=.coverage.unit uv run pytest tests/unit --cov --cov-fail-under=0
	COVERAGE_FILE=.coverage.integration uv run pytest tests/integration --cov --cov-fail-under=0
	uv run coverage combine
	uv run coverage report

check-migrations: ## Verifie les migrations : head unique, reversibilite, absence de derive (DB requise)
	@heads=$$(uv run alembic heads | grep -c '(head)' || true); \
	  test "$$heads" -eq 1 || { echo "ERREUR : $$heads heads Alembic au lieu de 1"; exit 1; }
	uv run alembic upgrade head
	uv run alembic check
	uv run alembic downgrade base
	uv run alembic upgrade head
