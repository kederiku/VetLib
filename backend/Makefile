.PHONY: install dev worker scheduler lint format typecheck test test-unit test-integration migrate revision openapi

install:
	uv sync

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
