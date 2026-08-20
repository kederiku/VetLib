#!/bin/bash
# Crée le rôle applicatif non-superuser (RLS effective : NOBYPASSRLS + non-propriétaire des tables).
# Exécuté par l'entrypoint postgres au premier démarrage (volume pgdata vierge uniquement).
#
# Pourquoi ce script est la clé de voûte de la sécurité multi-tenant : dans PostgreSQL,
# la Row-Level Security ne s'applique NI aux superusers, NI aux rôles BYPASSRLS, NI
# (sans FORCE) au propriétaire des tables. Pour que les policies filtrant par
# app.clinic_id soient incontournables, l'application doit donc endosser un rôle qui
# n'est rien de tout cela :
#   - NOSUPERUSER + NOBYPASSRLS : aucun moyen de passer outre les policies ;
#   - non-propriétaire : les tables sont créées par Alembic sous $POSTGRES_USER,
#     jamais sous $APP_DB_USER.
# Concrètement, tenant_uow() fait "SET LOCAL ROLE vetolib_app" puis
# "SET LOCAL app.clinic_id = '<uuid>'" : toute requête est alors filtrée par la
# clinique courante, y compris en cas de bug applicatif (défense en profondeur).
# Les flux pré-tenant (login, register) passent eux par system_uow(), sans bascule.
#
# APP_DB_USER / APP_DB_PASSWORD sont injectées par docker-compose (service postgres)
# depuis le .env racine. Les scripts de /docker-entrypoint-initdb.d s'exécutent en
# ordre alphabétique : celui-ci passe après 01-extensions.sql.
set -e

# psql en tant que superuser sur la base applicative.
# -v ON_ERROR_STOP=1 : psql s'arrête (code non nul) à la première erreur SQL, au lieu
#   de continuer silencieusement -- combiné à set -e, l'init échoue franchement.
# <<-EOSQL : heredoc dont les TABULATIONS de tête sont retirées (le tiret), ce qui
#   permet d'indenter le SQL ci-dessous sans altérer le texte envoyé à psql.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	-- NOBYPASSRLS est LE mot-clé : sans lui, la RLS serait décorative pour ce rôle.
	-- NOCREATEDB / NOCREATEROLE : moindre privilège, le rôle ne peut rien créer d'autre.
	-- LOGIN : le rôle peut aussi servir de compte de connexion direct ; en dev l'app se
	-- connecte en $POSTGRES_USER puis bascule via SET LOCAL ROLE $APP_DB_USER.
	CREATE ROLE $APP_DB_USER LOGIN PASSWORD '$APP_DB_PASSWORD' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
	-- Accès minimal : se connecter à la base et utiliser le schéma public.
	GRANT CONNECT ON DATABASE $POSTGRES_DB TO $APP_DB_USER;
	GRANT USAGE ON SCHEMA public TO $APP_DB_USER;
	-- ALTER DEFAULT PRIVILEGES : droits accordés AUTOMATIQUEMENT aux futurs objets créés
	-- par $POSTGRES_USER -- inutile de re-GRANT à chaque nouvelle table de migration.
	-- Les tables/séquences créées ensuite par Alembic (rôle $POSTGRES_USER) seront accessibles au rôle applicatif.
	-- Pas de DELETE : soft delete uniquement (cohérent avec les GRANT des migrations).
	ALTER DEFAULT PRIVILEGES FOR ROLE $POSTGRES_USER IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO $APP_DB_USER;
	ALTER DEFAULT PRIVILEGES FOR ROLE $POSTGRES_USER IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO $APP_DB_USER;
EOSQL
