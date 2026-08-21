# syntax=docker/dockerfile:1
# Dockerfile mutualisé pour les deux frontends Next.js (standalone).
# Contexte de build : racine du repo ; ARG APP_DIR = frontend-b2c | frontend-b2b.
#
# Un seul Dockerfile pour les deux apps : docker-compose passe APP_DIR en argument de
# build (frontend-b2c pour le portail :3000, frontend-b2b pour les cliniques :3001).
# Multi-stage : base -> deps -> dev (compose) ou builder -> runner (image prod minimale).

# ARG déclaré avant le premier FROM : portée "globale", mais chaque stage qui l'utilise
# doit le REdéclarer (règle Dockerfile : un ARG global n'entre pas seul dans les stages).
ARG APP_DIR

FROM node:26.7-alpine3.24 AS base
WORKDIR /app

# ----- Dépendances -----
# Même astuce de cache que côté backend : seuls package.json/package-lock.json sont copiés,
# donc cette couche (et le npm ci) n'est reconstruite que si les dépendances changent.
FROM base AS deps
ARG APP_DIR
COPY ${APP_DIR}/package.json ${APP_DIR}/package-lock.json ./
# npm ci (et non npm install) : installe EXACTEMENT le lockfile, échoue s'il est
# désynchronisé de package.json -> builds reproductibles.
RUN npm ci

# ----- Cible dev (code bind-mounté par compose, node_modules en volume anonyme) -----
# Aucun COPY du code ici : compose monte ./frontend-b2c (ou -b2b) sur /app, et un volume
# anonyme préserve le node_modules installé au stage deps (celui de l'hôte, compilé pour
# macOS/Windows, serait incompatible avec l'Alpine du conteneur).
FROM deps AS dev
ENV NODE_ENV=development
CMD ["npm", "run", "dev"]

# ----- Build production (next.config : output 'standalone') -----
# "standalone" demande à Next de produire dans .next/standalone un serveur Node autonome
# (server.js + le strict minimum de node_modules) : l'image finale n'a pas besoin du
# node_modules complet ni des sources.
FROM deps AS builder
ARG APP_DIR
COPY ${APP_DIR}/ ./
# Garantit l'existence de public/ pour la copie du stage runner (dossier optionnel dans Next).
RUN mkdir -p public \
    && npm run build

# ----- Cible prod -----
# Repart de "base" (Node nu, sans node_modules ni sources) et n'embarque que les
# artefacts du build : image minimale, surface d'attaque réduite.
FROM base AS runner
# HOSTNAME=0.0.0.0 : le server.js standalone écoute sur toutes les interfaces du
# conteneur (par défaut localhost, injoignable depuis l'extérieur du conteneur).
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0
# Les assets statiques et public/ ne sont pas inclus dans standalone : ils sont copiés
# séparément, aux emplacements exacts attendus par server.js.
# --chown=node:node : appartiennent à l'utilisateur non-root "node" fourni par l'image.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
CMD ["node", "server.js"]
