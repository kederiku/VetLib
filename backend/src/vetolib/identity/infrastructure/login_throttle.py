"""Adapter Redis du port LoginThrottle : limitation de debit du login admin.

Pourquoi seulement le back-office : c'est le seul espace ou un unique mot de
passe ouvre les donnees de TOUS les tenants, et ou la population de comptes
se compte sur les doigts d'une main. Une attaque en ligne y est un scenario
realiste, pas une hypothese d'ecole. Les deux autres espaces beneficieront
du meme mecanisme le jour ou on le decidera -- ce n'est pas une omission,
c'est un perimetre.

Mecanique : un compteur d'ECHECS par cle, avec expiration. La premiere
tentative ratee cree la cle et pose son TTL ; les suivantes l'incrementent
sans le prolonger (fenetre fixe et non glissante -- plus simple, et la
difference est sans importance pour un garde-fou anti-force brute). Au-dela
du seuil, on renvoie le TTL restant, que le routeur traduit en
`429 + Retry-After`. Une connexion reussie efface les compteurs.

Deux cles par tentative : l'adresse IP et l'email. L'IP seule laisserait
passer une attaque distribuee sur un compte precis ; l'email seul offrirait
a un attaquant un moyen de bloquer un fondateur en tapant volontairement
faux (deni de service). Les deux ensemble couvrent les deux cas, et AUCUN
verrouillage definitif du compte n'est pose : ce serait offrir ce deni de
service, alors qu'aucun canal de deblocage n'existe.

FAIL-OPEN assume : si Redis est injoignable, on journalise et on laisse
passer. Meme philosophie que FallbackPasswordChecker -- refuser toutes les
connexions parce qu'un service auxiliaire est tombe transformerait une panne
mineure en panne totale du back-office, et personne ne pourrait plus la
reparer depuis l'interface.
"""

import hashlib
from collections.abc import Sequence

import redis.asyncio as aioredis
import structlog

logger = structlog.get_logger(__name__)


def login_throttle_keys(*, ip: str | None, email: str) -> tuple[str, str]:
    """Construit les deux cles de comptage d'une tentative de connexion.

    L'email est HACHE (SHA-256 tronque) : Redis n'a aucune raison de contenir
    en clair les adresses des fondateurs, et son contenu se retrouve dans les
    exports de debug comme dans les copies d'ecran. Le hachage est suffisant
    ici : on ne cherche pas a proteger un secret, seulement a ne pas
    disseminer une donnee personnelle dans un cache technique.
    """
    empreinte = hashlib.sha256(email.strip().lower().encode()).hexdigest()[:16]
    return (f"admin:login:fail:ip:{ip or 'inconnue'}", f"admin:login:fail:mail:{empreinte}")


class RedisLoginThrottle:
    """Compteur d'echecs de connexion adosse au Redis deja present.

    Le client vient de app.state (cree une fois au lifespan) : on ne rouvre
    pas de connexion par tentative.
    """

    def __init__(self, redis: aioredis.Redis, *, max_attempts: int, window_seconds: int) -> None:
        self._redis = redis
        self._max_attempts = max_attempts
        self._window_seconds = window_seconds

    async def seconds_until_retry(self, keys: Sequence[str]) -> int | None:
        """Delai restant si l'une des cles a depasse le seuil, sinon None."""
        try:
            for key in keys:
                brut = await self._redis.get(key)
                if brut is None:
                    continue
                if int(brut) < self._max_attempts:
                    continue
                ttl = int(await self._redis.ttl(key))
                # ttl < 0 : cle sans expiration (-1) ou disparue entre les
                # deux appels (-2). On rend au moins une seconde plutot que
                # de laisser passer, et jamais une valeur negative.
                return max(ttl, 1)
        except Exception:
            logger.warning("admin_login_throttle_indisponible", action="verification")
        return None

    async def record_failure(self, keys: Sequence[str]) -> None:
        """Incremente les compteurs, en posant le TTL a la premiere occurrence."""
        try:
            for key in keys:
                compte = int(await self._redis.incr(key))
                if compte == 1:
                    # Fenetre FIXE : le TTL n'est pose qu'a la creation, donc
                    # une rafale d'echecs ne repousse pas indefiniment la
                    # date de deblocage.
                    await self._redis.expire(key, self._window_seconds)
        except Exception:
            logger.warning("admin_login_throttle_indisponible", action="incrementation")

    async def reset(self, keys: Sequence[str]) -> None:
        """Efface les compteurs apres une connexion reussie."""
        try:
            await self._redis.delete(*keys)
        except Exception:
            logger.warning("admin_login_throttle_indisponible", action="remise a zero")
