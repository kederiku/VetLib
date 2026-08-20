#!/bin/sh
# Service one-shot minio-init : crée le bucket documents s'il n'existe pas déjà.
set -e

mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
mc mb --ignore-existing "local/$S3_BUCKET_DOCUMENTS"
