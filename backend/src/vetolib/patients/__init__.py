"""Contexte patients : les animaux des propriétaires (et bientôt leurs
dossiers médicaux).

Première tranche implémentée : l'agrégat Pet (CRUD des animaux d'un
propriétaire, portail B2C). Organisation identique au contexte identity :
domain (entités pures), application (use cases), infrastructure (SQLAlchemy),
presentation (routes FastAPI).

Particularité : la table pets est GLOBALE (rattachée à un owner, compte hors
tenant), comme owners -- pas de clinic_id ni de RLS. Les données tenantées du
contexte (les futurs medical_records, propriété d'une clinique) viendront
plus tard avec leur propre RLS.
"""
