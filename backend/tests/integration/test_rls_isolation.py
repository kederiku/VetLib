"""Verrouille le comportement RLS : gabarit pour les contextes suivants."""

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


def _payload(clinic: str, email: str) -> dict[str, str]:
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
    # Deux cliniques, un user chacune (via l'API — flux réel).
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
        # Rôle propriétaire (pool) : RLS non appliquée -> voit tout.
        async with engine.connect() as conn:
            total = (await conn.execute(text("SELECT count(*) FROM users"))).scalar_one()
            assert total == 2

        # Rôle applicatif + app.clinic_id = A -> ne voit QUE les users de A.
        async with engine.connect() as conn:
            await conn.execute(text('SET LOCAL ROLE "vetolib_app"'))
            await conn.execute(
                text("SELECT set_config('app.clinic_id', :cid, true)"), {"cid": clinic_a}
            )
            visible = (await conn.execute(text("SELECT count(*) FROM users"))).scalar_one()
            emails = (await conn.execute(text("SELECT email FROM users"))).scalars().all()
            assert visible == 1
            assert emails == ["a@clinique.fr"]

        # Rôle applicatif SANS app.clinic_id -> fail-closed : 0 ligne.
        async with engine.connect() as conn:
            await conn.execute(text('SET LOCAL ROLE "vetolib_app"'))
            visible = (await conn.execute(text("SELECT count(*) FROM users"))).scalar_one()
            assert visible == 0
    finally:
        await engine.dispose()
