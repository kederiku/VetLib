"""Entité Clinic : la clinique vétérinaire, tenant racine de la plateforme.

Couche domain du contexte identity (architecture hexagonale). Ce fichier ne
contient qu'une dataclass pure : zéro import de framework (ni SQLAlchemy, ni
FastAPI), donc testable sans base de données ni serveur HTTP. La persistance
est décrite par le port ClinicRepository et réalisée dans infrastructure/.

L'id de la Clinic est LE clinic_id du multi-tenant : c'est lui que le UoW
tenant pose en variable de session PostgreSQL (SET LOCAL app.clinic_id) pour
que les politiques RLS isolent les données de chaque clinique.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime

from vetolib.identity.domain.events import ClinicRegistered
from vetolib.identity.domain.value_objects import Address, Email, Timezone
from vetolib.shared.domain.entity import Entity


# kw_only : oblige les appels avec arguments nommés (pas d'inversion possible).
# eq=False : conserve l'égalité par id héritée d'Entity (identité, pas valeur).
@dataclass(kw_only=True, eq=False)
class Clinic(Entity):
    """Tenant principal de la plateforme.

    Hérite d'Entity : id UUID, created_at, deleted_at (soft delete : on ne
    supprime jamais physiquement une clinique, on renseigne deleted_at).
    """

    name: str
    email: Email  # value object : email déjà validé et normalisé, par construction
    phone: str | None = None
    # Adresse structuree "tout ou rien" (meme modele que Owner) : absente a
    # l'inscription, renseignee ensuite via updateMyClinic. Indispensable a
    # l'annuaire public (recherche par ville) et a la future facturation.
    address: Address | None = None
    # Fuseau IANA (str deja validee par le VO Timezone au moment de l'ecrire) :
    # l'agenda interpretera les horaires d'ouverture dans CE fuseau, la base
    # stockant tout en UTC. Defaut France, marche principal du produit.
    timezone: str = "Europe/Paris"

    @classmethod
    def register(
        cls, *, name: str, email: Email, phone: str | None, now: datetime
    ) -> tuple["Clinic", ClinicRegistered]:
        """Factory method : construit la clinique ET son événement de domaine.

        Pourquoi une factory plutôt qu'un __init__ direct ?
        - centraliser les invariants de création : l'id UUID est généré ici,
          côté domaine (et non par la base), l'entité est donc complète avant
          tout INSERT ;
        - produire l'événement ClinicRegistered en même temps que l'entité :
          le use case (RegisterClinic) l'ajoute à l'outbox dans la MÊME
          transaction que les INSERT (atomicité garantie), puis le relais
          TaskIQ le publie en asynchrone (pattern Outbox).

        `now` est injecté (port Clock de la couche application) au lieu
        d'appeler datetime.now() ici : le domaine reste déterministe et
        trivialement testable avec une horloge figée.
        """
        clinic = cls(id=uuid.uuid4(), created_at=now, name=name, email=email, phone=phone)
        event = ClinicRegistered(
            occurred_at=now,
            clinic_id=clinic.id,
            clinic_name=name,
            manager_email=email.value,
        )
        return clinic, event

    def update_profile(
        self, *, name: str, phone: str | None, address: Address | None, timezone: Timezone
    ) -> None:
        """Met à jour la fiche publique et les réglages de la clinique.

        Volontairement SANS email : c'est l'identifiant d'inscription de la
        clinique (celui du gérant fondateur) -- son changement exigera un flux
        vérifié dédié, comme pour les comptes. L'exclure d'ici rend l'oubli
        impossible par construction (même règle qu'Owner.update_profile).

        `timezone` arrive en value object (déjà validé par zoneinfo) et est
        stocké aplati en str : l'entité ne peut donc recevoir que des fuseaux
        valides, sans revalider elle-même.
        """
        self.name = name
        self.phone = phone
        self.address = address
        self.timezone = timezone.value
