#!/bin/bash
# Crée le rôle applicatif non-superuser (RLS effective : NOBYPASSRLS + non-propriétaire des tables).
# Exécuté par l'entrypoint postgres au premier démarrage (volume pgdata vierge uniquement).
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE ROLE $APP_DB_USER LOGIN PASSWORD '$APP_DB_PASSWORD' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
	GRANT CONNECT ON DATABASE $POSTGRES_DB TO $APP_DB_USER;
	GRANT USAGE ON SCHEMA public TO $APP_DB_USER;
	-- Les tables/séquences créées ensuite par Alembic (rôle $POSTGRES_USER) seront accessibles au rôle applicatif.
	-- Pas de DELETE : soft delete uniquement (cohérent avec les GRANT des migrations).
	ALTER DEFAULT PRIVILEGES FOR ROLE $POSTGRES_USER IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO $APP_DB_USER;
	ALTER DEFAULT PRIVILEGES FOR ROLE $POSTGRES_USER IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO $APP_DB_USER;
EOSQL
