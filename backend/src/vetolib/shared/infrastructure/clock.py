"""Horloge système : adapter concret du port `Clock` (application/clock.py).

Les use cases reçoivent le temps par injection plutôt que d'appeler
`datetime.now()` en dur : en test on substitue une horloge figée, ce qui
rend déterministes les scénarios sensibles au temps (expiration des JWT
d'accès à 15 min, `occurred_at` des événements, horodatages métier).
"""

from datetime import UTC, datetime


class SystemClock:
    """Horloge réelle, toujours en UTC "aware".

    Convention projet : jamais de datetime naïf. Les colonnes DB sont en
    `timestamptz` et les claims `exp`/`iat` des JWT se comparent en UTC ;
    une timezone locale introduirait des bugs silencieux de comparaison.
    """

    def now(self) -> datetime:
        return datetime.now(UTC)
