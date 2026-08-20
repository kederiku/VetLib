import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Index, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from vetolib.shared.infrastructure.db.base import Base


class OutboxEventModel(Base):
    """File transactionnelle : écrite avec la transaction métier qui a produit
    l'événement, relayée ensuite vers TaskIQ (table système, pas de RLS)."""

    __tablename__ = "outbox_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    event_type: Mapped[str] = mapped_column(String(200), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index(
            "ix_outbox_events_unprocessed",
            "occurred_at",
            postgresql_where=text("processed_at IS NULL"),
        ),
    )
