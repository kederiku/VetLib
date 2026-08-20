-- Script d'initialisation Postgres (monté dans /docker-entrypoint-initdb.d, exécuté par
-- l'entrypoint de l'image officielle, en superuser, au tout premier démarrage seulement,
-- c'est-à-dire quand le volume pgdata est vierge). Le préfixe numérique "01-" garantit
-- son passage AVANT 02-app-role.sh (ordre alphabétique).
-- Installer l'extension ici la rend disponible avant toute migration Alembic ; CREATE
-- EXTENSION exige des privilèges élevés, que l'entrypoint (superuser) possède justement.
-- gen_random_uuid() est natif depuis PG13 ; pgcrypto reste nécessaire pour digest() (chaînage hash côté audit).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
