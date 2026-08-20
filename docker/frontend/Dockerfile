# syntax=docker/dockerfile:1
# Dockerfile mutualisé pour les deux frontends Next.js (standalone).
# Contexte de build : racine du repo ; ARG APP_DIR = frontend-b2c | frontend-b2b.

ARG APP_DIR

FROM node:24.19-alpine3.24 AS base
WORKDIR /app

# ----- Dépendances -----
FROM base AS deps
ARG APP_DIR
COPY ${APP_DIR}/package.json ${APP_DIR}/package-lock.json ./
RUN npm ci

# ----- Cible dev (code bind-mounté par compose, node_modules en volume anonyme) -----
FROM deps AS dev
ENV NODE_ENV=development
CMD ["npm", "run", "dev"]

# ----- Build production (next.config : output 'standalone') -----
FROM deps AS builder
ARG APP_DIR
COPY ${APP_DIR}/ ./
# Garantit l'existence de public/ pour la copie du stage runner (dossier optionnel dans Next).
RUN mkdir -p public \
    && npm run build

# ----- Cible prod -----
FROM base AS runner
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
CMD ["node", "server.js"]
