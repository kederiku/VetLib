.PHONY: install install-ci dev worker scheduler lint format typecheck \
        test test-unit test-integration coverage check-migrations \
        migrate revision openapi

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

openapi:
	uv run python -c "import json; from vetolib.main import app; print(json.dumps(app.openapi()))" > openapi.json

coverage: ## Couverture consolidee des tests unitaires ET d'integration (Docker requis)
	@rm -f .coverage .coverage.unit .coverage.integration
	COVERAGE_FILE=.coverage.unit uv run pytest tests/unit --cov
	COVERAGE_FILE=.coverage.integration uv run pytest tests/integration --cov
	uv run coverage combine
	uv run coverage report

check-migrations: ## Verifie les migrations : head unique, reversibilite, absence de derive (DB requise)
	@heads=$$(uv run alembic heads | grep -c '(head)' || true); \
	  test "$$heads" -eq 1 || { echo "ERREUR : $$heads heads Alembic au lieu de 1"; exit 1; }
	uv run alembic upgrade head
	uv run alembic check
	uv run alembic downgrade base
	uv run alembic upgrade head
