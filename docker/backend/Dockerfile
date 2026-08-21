# syntax=docker/dockerfile:1
# Image unique partagée api / worker / scheduler (seule la commande change, fournie par compose).
# Contexte de build : ./backend
#
# Build multi-stage : base (Python + uv) -> deps (dépendances seules, couche très cachée)
# -> dev (compose) ou prod (image finale autonome). La ligne "# syntax=" active la version
# moderne du frontend Dockerfile (nécessaire aux montages de cache RUN --mount plus bas).

# ----- Stage base : Python + le gestionnaire de paquets uv -----
FROM python:3.14.7-slim-trixie AS base
# uv n'est pas installé via pip : on copie ses binaires depuis l'image officielle
# (version épinglée = builds reproductibles).
COPY --from=ghcr.io/astral-sh/uv:0.12.5 /uv /uvx /bin/
# UV_COMPILE_BYTECODE : précompile les .pyc au build (démarrage plus rapide du conteneur).
# UV_LINK_MODE=copy   : copie les paquets au lieu de liens durs (le cache uv est sur un
#                       autre système de fichiers via --mount=type=cache, liens impossibles).
# PATH               : place le venv en tête -> "uvicorn", "taskiq"... s'invoquent
#                       directement, sans préfixe "uv run".
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"
WORKDIR /app

# ----- Couche dépendances (cachée tant que pyproject.toml/uv.lock ne changent pas) -----
# Astuce classique : on ne copie QUE les fichiers de verrouillage avant d'installer.
# Modifier le code source n'invalide donc pas cette couche -> rebuilds quasi instantanés.
FROM base AS deps
COPY pyproject.toml uv.lock ./
# --mount=type=cache : le cache de téléchargement d'uv persiste entre les builds.
# --locked : refuse de dévier d'uv.lock (reproductibilité stricte).
# --no-install-project : dépendances seules ; le projet lui-même arrive au stage suivant.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project --no-dev

# ----- Cible dev (utilisée par docker-compose : code bind-mounté, commande fournie par compose) -----
# Le COPY du code sert surtout à installer le projet ; en pratique, compose bind-monte
# ./backend/src par-dessus /app/src, donc le code "vivant" vient de l'hôte.
FROM deps AS dev
COPY . .
# uv sync sans --no-dev : installe aussi les outils de dev (pytest, ruff, mypy...).
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked
# Utilisateur système non-root : même en dev, on n'exécute pas l'app en root
# (bonne pratique de moindre privilège, et parité avec la prod).
RUN groupadd --system app \
    && useradd --system --gid app --home-dir /app --shell /usr/sbin/nologin app \
    && chown -R app:app /app
USER app
EXPOSE 8000
# Pas de CMD ici : c'est docker-compose qui fournit la commande (uvicorn --reload,
# taskiq worker ou taskiq scheduler) -> une seule image pour trois services.

# ----- Cible prod -----
FROM deps AS prod
COPY . .
# --no-dev : dépendances de production uniquement (image plus légère, surface réduite).
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev
RUN groupadd --system app \
    && useradd --system --gid app --home-dir /app --shell /usr/sbin/nologin app \
    && chown -R app:app /app
USER app
EXPOSE 8000
# En prod, uvicorn tourne derrière un reverse proxy (TLS terminé en amont) :
# --proxy-headers + --forwarded-allow-ips font confiance aux en-têtes X-Forwarded-*
# pour restituer le schéma https et l'IP client réelle -- indispensable pour que
# les cookies JWT marqués Secure et les logs soient corrects.
CMD ["uvicorn", "vetolib.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
