"""Dépendances FastAPI TRANSVERSES, partagées par tous les contextes.

Historiquement définies dans identity (premier contexte implémenté), ces
briques n'ont rien de spécifique à l'authentification : chaque contexte
(patients, scheduling, billing...) a besoin des Settings et du sessionmaker
pour construire son Unit of Work. Les remonter ici évite qu'un contexte
métier importe la presentation d'identity pour de la simple plomberie.

identity/presentation/dependencies.py les ré-exporte : les imports existants
ne changent pas (compatibilité), mais les NOUVEAUX contextes importent d'ici.
"""

from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from vetolib.config import Settings, get_settings

# get_settings est décoré @lru_cache : les Settings ne sont lus qu'une fois.
SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_sessionmaker(request: Request) -> async_sessionmaker[AsyncSession]:
    """Récupère le sessionmaker créé une seule fois au démarrage (lifespan).

    L'engine SQLAlchemy et son pool de connexions sont coûteux : ils vivent
    dans app.state, et cette dépendance ne fait que les exposer par requête.
    """
    sessionmaker: async_sessionmaker[AsyncSession] = request.app.state.sessionmaker
    return sessionmaker


SessionmakerDep = Annotated[async_sessionmaker[AsyncSession], Depends(get_sessionmaker)]
