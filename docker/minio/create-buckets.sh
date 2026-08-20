#!/bin/sh
# Service one-shot minio-init : crée le bucket documents s'il n'existe pas déjà.
#
# Exécuté par le conteneur minio-init (image minio/mc, le client en ligne de commande
# de MinIO) une fois le healthcheck de minio au vert. Les variables d'environnement
# (MINIO_ROOT_USER, MINIO_ROOT_PASSWORD, S3_BUCKET_DOCUMENTS) sont injectées par
# docker-compose depuis le .env racine.
# set -e : toute commande en échec stoppe le script avec un code non nul, ce qui fait
# échouer la condition service_completed_successfully et bloque le démarrage de l'api
# (mieux vaut ne pas démarrer que démarrer sans bucket).
set -e

# Enregistre l'endpoint MinIO sous l'alias "local". Le hostname "minio" est le nom du
# service docker-compose, résolu par le DNS interne du réseau vetolib (port 9000 = API S3).
mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
# mb = make bucket. --ignore-existing rend la commande idempotente : le script peut
# être rejoué à chaque "docker compose up" sans erreur si le bucket existe déjà.
mc mb --ignore-existing "local/$S3_BUCKET_DOCUMENTS"
