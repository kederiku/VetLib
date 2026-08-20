"""Verrouille le comportement RLS : gabarit pour les contextes suivants.

La Row-Level Security est LA garantie d'étanchéité entre cliniques (tenants) :
c'est PostgreSQL lui-même, et non le code Python, qui filtre chaque ligne
selon la policy "tenant_isolation" (clinic_id = valeur de la variable de
session app.clinic_id). Même un bug applicatif (un WHERE oublié dans une
requête) ne peut donc pas faire fuiter les données d'une autre clinique.

Ce test prouve les trois comportements clés, impossibles à vérifier sans un
vrai PostgreSQL (d'où testcontainers, jamais SQLite) :
1. le rôle propriétaire des tables ignore la RLS (pool de migrations/admin) ;
2. le rôle applicatif "vetolib_app" (NOBYPASSRLS) ne voit que SON tenant ;
3. sans app.clinic_id posé, il ne voit RIEN : fail-closed, l'oubli de
   contexte tenant est un déni de service local, jamais une fuite de données.

Les patients, scheduling et billing réutiliseront la même policy : ce fichier
sert de modèle pour leurs futurs tests d'isolation.
"""

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


def _payload(clinic: str, email: str) -> dict[str, str]:
    """Payload d'inscription minimal, paramétré pour créer deux tenants."""
    return {
        "clinic_name": clinic,
        "email": email,
        "password": "correct-horse-battery",
        "first_name": "Ana",
        "last_name": "Martin",
    }


async def test_un_tenant_ne_voit_pas_les_users_de_l_autre(
    client: httpx.AsyncClient, app_env: dict[str, str]
) -> None:
    """Preuve d'isolation RLS entre deux cliniques, au niveau SQL brut."""
    # Arrange : deux cliniques, un user chacune (via l'API — flux réel).
    resp_a = await client.post(
        "/api/v1/clinics/register", json=_payload("Clinique A", "a@clinique.fr")
    )
    resp_b = await client.post(
        "/api/v1/clinics/register", json=_payload("Clinique B", "b@clinique.fr")
    )
    assert resp_a.status_code == resp_b.status_code == 201
    clinic_a = resp_a.json()["clinic_id"]

    engine = create_async_engine(app_env["DATABASE_URL"])
    try:
        # Act/Assert 1 : Rôle propriétaire (pool) : RLS non appliquée -> voit tout.
        # Le propriétaire des tables bypasse ses propres policies (pas de
        # FORCE ROW LEVEL SECURITY) : c'est le mode des migrations et du
        # system_uow (login, register), qui travaillent hors contexte tenant.
        async with engine.connect() as conn:
            total = (await conn.execute(text("SELECT count(*) FROM users"))).scalar_one()
            assert total == 2

        # Act/Assert 2 : Rôle applicatif + app.clinic_id = A -> ne voit QUE les
        # users de A. On rejoue à la main ce que fait tenant_uow(clinic_id) à
        # chaque requête métier : SET LOCAL ROLE (rôle NOBYPASSRLS, donc soumis
        # aux policies) puis set_config(..., true) = portée transaction
        # uniquement, rien ne fuit sur la connexion poolée rendue ensuite.
        async with engine.connect() as conn:
            await conn.execute(text('SET LOCAL ROLE "vetolib_app"'))
            # set_config est paramétrable (:cid), contrairement à SET LOCAL
            # qui n'accepte pas de bind : pas de concaténation SQL manuelle.
            await conn.execute(
                text("SELECT set_config('app.clinic_id', :cid, true)"), {"cid": clinic_a}
            )
            visible = (await conn.execute(text("SELECT count(*) FROM users"))).scalar_one()
            emails = (await conn.execute(text("SELECT email FROM users"))).scalars().all()
            assert visible == 1
            assert emails == ["a@clinique.fr"]

        # Act/Assert 3 : Rôle applicatif SANS app.clinic_id -> fail-closed :
        # 0 ligne. Dans la policy, current_setting('app.clinic_id', true)
        # renvoie NULL, la comparaison clinic_id = NULL est fausse pour toute
        # ligne : oublier de poser le tenant ne montre jamais tout le monde.
        async with engine.connect() as conn:
            await conn.execute(text('SET LOCAL ROLE "vetolib_app"'))
            visible = (await conn.execute(text("SELECT count(*) FROM users"))).scalar_one()
            assert visible == 0
    finally:
        await engine.dispose()
