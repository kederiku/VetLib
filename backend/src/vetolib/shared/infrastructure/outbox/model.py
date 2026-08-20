"""Modèle SQLAlchemy de la table `outbox_events` — la brique de persistance du pattern Outbox.

Pourquoi une table plutôt qu'une publication directe vers TaskIQ/Redis ?
Parce qu'un use case qui écrit en base PUIS publie un message manipule deux
systèmes distincts qu'on ne peut pas engager dans une seule transaction :

- si on publie avant le commit et que le commit échoue, on a annoncé un fait
  qui n'a jamais eu lieu (email de bienvenue pour une clinique jamais créée) ;
- si on publie après le commit et que le process meurt entre les deux,
  l'événement est perdu à jamais (clinique créée, aucun email).

Le pattern Outbox résout ce dilemme en n'écrivant QUE dans PostgreSQL : les
lignes métier et la ligne d'événement partent dans la MEME transaction (voir
`SqlAlchemyUnitOfWork.commit`), donc soit tout est commité, soit rien. Un
relais (voir `outbox/relay.py`) lit ensuite la table et publie vers TaskIQ,
avec une garantie de livraison at-least-once.

Place dans l'architecture : couche infrastructure du contexte `shared`, car
tous les bounded contexts (identity, patients, ...) déposent leurs événements
dans cette même table.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Index, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from vetolib.shared.infrastructure.db.base import Base


class OutboxEventModel(Base):
    """File transactionnelle : écrite avec la transaction métier qui a produit
    l'événement, relayée ensuite vers TaskIQ (table système, pas de RLS).

    "Pas de RLS" : contrairement aux tables métier filtrées par `clinic_id`,
    cette table est technique et lue par le relais, qui tourne hors de tout
    contexte tenant — un filtrage RLS lui masquerait des événements.

    Chaque ligne est le miroir persisté d'un `DomainEvent` (shared/domain/events.py) :
    même id, même type, même payload, même horodatage.
    """

    __tablename__ = "outbox_events"

    # L'id vient de `DomainEvent.event_id` (généré côté Python) : il sert de
    # clé d'idempotence naturelle si un handler veut dédupliquer les rejeux.
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    # Nom qualifié de l'événement, ex. "identity.clinic_registered" — c'est la
    # clé de routage vers le bon handler (voir outbox/registry.py).
    event_type: Mapped[str] = mapped_column(String(200), nullable=False)
    # JSONB (et pas JSON texte) : validé, compact, indexable si besoin.
    # Le contenu doit rester JSON-sérialisable (contrat de DomainEvent.payload()).
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    # Date du fait métier (fournie par le domaine), utilisée pour relayer les
    # événements dans l'ordre chronologique.
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # NULL = en attente de relais ; non NULL = déjà publié (on marque au lieu de
    # supprimer, conformément à la philosophie "jamais de DELETE" du projet —
    # cela garde aussi une trace auditable, purgeable plus tard).
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        # Index PARTIEL (clause WHERE) : il n'indexe que les lignes non traitées,
        # c'est-à-dire la seule partie que le relais interroge en boucle. La table
        # peut grossir sans ralentir le polling, l'index reste minuscule.
        Index(
            "ix_outbox_events_unprocessed",
            "occurred_at",
            postgresql_where=text("processed_at IS NULL"),
        ),
    )
