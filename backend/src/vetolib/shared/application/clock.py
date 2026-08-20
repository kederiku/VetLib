from datetime import datetime
from typing import Protocol


class Clock(Protocol):
    """Source de temps injectable (UTC) — testable avec une horloge fixe."""

    def now(self) -> datetime: ...
