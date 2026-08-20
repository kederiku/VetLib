# syntax=docker/dockerfile:1
# Image unique partagée api / worker / scheduler (seule la commande change, fournie par compose).
# Contexte de build : ./backend

FROM python:3.13.15-slim-trixie AS base
COPY --from=ghcr.io/astral-sh/uv:0.12.5 /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"
WORKDIR /app

# ----- Couche dépendances (cachée tant que pyproject.toml/uv.lock ne changent pas) -----
FROM base AS deps
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project --no-dev

# ----- Cible dev (utilisée par docker-compose : code bind-mounté, commande fournie par compose) -----
FROM deps AS dev
COPY . .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked
RUN groupadd --system app \
    && useradd --system --gid app --home-dir /app --shell /usr/sbin/nologin app \
    && chown -R app:app /app
USER app
EXPOSE 8000

# ----- Cible prod -----
FROM deps AS prod
COPY . .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev
RUN groupadd --system app \
    && useradd --system --gid app --home-dir /app --shell /usr/sbin/nologin app \
    && chown -R app:app /app
USER app
EXPOSE 8000
CMD ["uvicorn", "vetolib.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
