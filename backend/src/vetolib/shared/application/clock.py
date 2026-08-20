"""Port Clock : source de temps injectable (contexte `shared`, couche
application).

Au sens hexagonal, c'est un "port" : une interface consommée par les
use cases ; l'adapter concret (SystemClock, qui renvoie
datetime.now(UTC)) vit dans shared/infrastructure/clock.py.

Pourquoi injecter l'horloge au lieu d'appeler datetime.now() partout ?
- Testabilité : en test, on injecte une horloge fixe, ce qui rend
  déterministes created_at, occurred_at, les expirations de JWT... et
  permet de "voyager dans le temps" (tester l'expiration d'un token).
- Cohérence : un point unique impose l'UTC ; pas de datetime naive ni
  de fuseau local qui varie selon la machine.
- Pureté : lire l'heure système est un effet de bord ; le passer par un
  port garde le domaine et les use cases purs et reproductibles.

Protocol = typage structurel (duck typing vérifié par mypy) : toute
classe exposant now() -> datetime convient, sans héritage explicite.
"""

from datetime import datetime
from typing import Protocol


class Clock(Protocol):
    """Source de temps injectable (UTC) — testable avec une horloge fixe."""

    def now(self) -> datetime: ...
