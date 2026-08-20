"""Socle base de données : Base déclarative, mixins et Unit of Work.

C'est ici que le multi-tenant est appliqué : tenant_uow passe en rôle
vetolib_app (NOBYPASSRLS) et fixe app.clinic_id pour la RLS PostgreSQL.
"""
