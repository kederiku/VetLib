"""Use cases d'ECRITURE du back-office sur les cliniques.

Quatre operations : consulter une fiche, en creer une (avec son premier
gerant, optionnellement), la mettre a jour, et changer son statut.

Chacune laisse une trace dans le journal d'audit, dans la MEME transaction
que la mutation : soit les deux sont enregistrees, soit aucune. Une mutation
sans trace serait un incident inexplicable six mois plus tard ; une trace
sans mutation serait un mensonge.
"""

import uuid
from datetime import datetime

from vetolib.identity.application.dto import (
    AdminActor,
    AdminClinicDetail,
    AdminCreateClinicCommand,
    AdminStaffCreated,
    AdminUpdateClinicCommand,
)
from vetolib.identity.application.mappers import to_admin_clinic_detail
from vetolib.identity.application.ports import (
    CompromisedPasswordChecker,
    IdentityUnitOfWork,
    IdentityUoWFactory,
    PasswordHasher,
)
from vetolib.identity.application.use_cases._email_availability import (
    ensure_email_available,
)
from vetolib.identity.domain.admin_audit import (
    AdminAuditEntry,
    AuditAction,
    AuditTargetType,
)
from vetolib.identity.domain.clinic import Clinic
from vetolib.identity.domain.errors import ClinicNotFoundError
from vetolib.identity.domain.passphrase import generer_phrase_de_passe
from vetolib.identity.domain.user import User
from vetolib.identity.domain.value_objects import (
    Address,
    Email,
    HashedPassword,
    PlainPassword,
    Timezone,
)
from vetolib.shared.application.clock import Clock


def _adresse(
    line1: str | None,
    line2: str | None,
    postal_code: str | None,
    city: str | None,
    country: str | None,
) -> Address | None:
    """Reconstruit le value object Address, ou None si le bloc est vide.

    Tout-ou-rien : le value object valide lui-meme que le trio obligatoire
    est complet. On ne le construit que si line1 est renseignee, exactement
    comme les repositories a la relecture.
    """
    if line1 is None or line1.strip() == "":
        return None
    return Address(
        line1=line1,
        line2=line2,
        postal_code=postal_code or "",
        city=city or "",
        country=country or "FR",
    )


async def _tracer(
    uow: IdentityUnitOfWork,
    *,
    actor: AdminActor,
    action: AuditAction,
    target_type: AuditTargetType,
    target_id: uuid.UUID,
    now: datetime,
    details: dict[str, object] | None = None,
) -> None:
    """Ajoute une ligne au journal d'audit dans la transaction courante."""
    await uow.audit_log.add(
        AdminAuditEntry.record(
            actor_id=actor.id,
            actor_email=actor.email,
            action=action,
            target_type=target_type,
            target_id=target_id,
            now=now,
            details=details or {},
        )
    )


class GetAdminClinic:
    """Fiche complete d'une clinique, effectif compris."""

    def __init__(self, uow_factory: IdentityUoWFactory) -> None:
        self._uow_factory = uow_factory

    async def execute(self, clinic_id: uuid.UUID) -> AdminClinicDetail:
        async with self._uow_factory() as uow:
            clinique = await uow.clinics.get_by_id(clinic_id)
            if clinique is None:
                raise ClinicNotFoundError("Clinique introuvable.")
            effectif = await uow.directory.count_active_staff(clinic_id)
            return to_admin_clinic_detail(clinique, effectif)


class CreateAdminClinic:
    """Cree une clinique, et optionnellement son premier gerant.

    Pourquoi ne pas reutiliser RegisterClinic, le use case de l'inscription
    publique ? Parce qu'il ne repond pas au meme besoin :

    - il ne connait qu'UN email, utilise a la fois pour la clinique et pour
      le gerant. Ici, l'adresse de contact de la clinique et l'identifiant de
      connexion d'une personne sont deux choses differentes ;
    - il n'accepte ni adresse ni fuseau, que le formulaire du back-office
      saisit des la creation ;
    - il n'admet pas de creer une clinique SANS gerant, alors que "je cree la
      clinique aujourd'hui, j'ajoute les gerants demain" est un flux naturel
      ici ;
    - il emet ClinicRegistered, dont l'email de bienvenue dit "vous venez de
      vous inscrire" -- faux quand c'est l'equipe qui a cree le compte ;
    - il n'a pas d'acteur, donc pas de ligne d'audit.

    Ce qui EST partage, c'est l'invariant qui compte : ensure_email_available.

    Tout se fait dans UNE transaction : clinique, gerant, evenement d'outbox
    et lignes d'audit sont commites ensemble ou pas du tout.
    """

    def __init__(
        self,
        uow_factory: IdentityUoWFactory,
        hasher: PasswordHasher,
        clock: Clock,
        breaches: CompromisedPasswordChecker,
    ) -> None:
        self._uow_factory = uow_factory
        self._hasher = hasher
        self._clock = clock
        self._breaches = breaches

    async def execute(
        self, cmd: AdminCreateClinicCommand, actor: AdminActor
    ) -> tuple[AdminClinicDetail, AdminStaffCreated | None]:
        email_clinique = Email(cmd.email)
        fuseau = Timezone(cmd.timezone)
        adresse = _adresse(
            cmd.address_line1, cmd.address_line2, cmd.postal_code, cmd.city, cmd.country
        )
        now = self._clock.now()

        # Le mot de passe du gerant est GENERE, jamais choisi : voir
        # domain/passphrase.py pour le raisonnement complet. Il est hache
        # AVANT d'ouvrir la transaction (Argon2 coute des dizaines de
        # millisecondes, qui ne doivent pas retenir une connexion du pool).
        phrase: str | None = None
        empreinte: HashedPassword | None = None
        if cmd.manager is not None:
            phrase = generer_phrase_de_passe()
            # La verification anti-compromission est executee MEME sur un
            # mot de passe genere. Elle ne se declenchera jamais en pratique,
            # mais elle garantit qu'il n'existe AUCUN chemin dans le code
            # menant a une empreinte stockee sans passer par la politique
            # complete. Le port a pour contrat de ne jamais lever pour une
            # raison technique : elle ne peut donc pas casser le flux.
            PlainPassword(phrase)
            await self._breaches.is_compromised(phrase)
            empreinte = HashedPassword(await self._hasher.hash(phrase))

        async with self._uow_factory() as uow:
            await ensure_email_available(uow, email_clinique)
            if cmd.manager is not None:
                await ensure_email_available(uow, Email(cmd.manager.email))

            clinique, evenement = Clinic.register(
                name=cmd.name, email=email_clinique, phone=cmd.phone, now=now
            )
            clinique.update_profile(
                name=cmd.name, phone=cmd.phone, address=adresse, timezone=fuseau
            )
            await uow.clinics.add(clinique)
            uow.add_event(evenement)
            await _tracer(
                uow,
                actor=actor,
                action=AuditAction.CLINIC_CREATED,
                target_type=AuditTargetType.CLINIC,
                target_id=clinique.id,
                now=now,
                details={"name": cmd.name, "email": email_clinique.value},
            )

            gerant_cree: AdminStaffCreated | None = None
            if cmd.manager is not None and empreinte is not None and phrase is not None:
                gerant = User.create(
                    clinic_id=clinique.id,
                    email=Email(cmd.manager.email),
                    hashed_password=empreinte,
                    first_name=cmd.manager.first_name,
                    last_name=cmd.manager.last_name,
                    role=cmd.manager.role,
                    now=now,
                )
                await uow.users.add(gerant)
                await _tracer(
                    uow,
                    actor=actor,
                    action=AuditAction.STAFF_CREATED,
                    target_type=AuditTargetType.USER,
                    target_id=gerant.id,
                    now=now,
                    # JAMAIS le mot de passe, ni son empreinte : ce journal
                    # est destine a etre lu.
                    details={"clinic_id": str(clinique.id), "role": gerant.role.value},
                )
                gerant_cree = AdminStaffCreated(
                    user_id=gerant.id,
                    email=gerant.email.value,
                    role=gerant.role,
                    temporary_password=phrase,
                )

            await uow.commit()
            effectif = 1 if gerant_cree is not None else 0
            return to_admin_clinic_detail(clinique, effectif), gerant_cree


class UpdateAdminClinic:
    """Met a jour la fiche d'une clinique. Sans son email, volontairement."""

    def __init__(self, uow_factory: IdentityUoWFactory, clock: Clock) -> None:
        self._uow_factory = uow_factory
        self._clock = clock

    async def execute(self, cmd: AdminUpdateClinicCommand, actor: AdminActor) -> AdminClinicDetail:
        fuseau = Timezone(cmd.timezone)
        adresse = _adresse(
            cmd.address_line1, cmd.address_line2, cmd.postal_code, cmd.city, cmd.country
        )
        async with self._uow_factory() as uow:
            clinique = await uow.clinics.get_by_id(cmd.clinic_id)
            if clinique is None:
                raise ClinicNotFoundError("Clinique introuvable.")

            clinique.update_profile(
                name=cmd.name, phone=cmd.phone, address=adresse, timezone=fuseau
            )
            await uow.clinics.update(clinique)
            await _tracer(
                uow,
                actor=actor,
                action=AuditAction.CLINIC_UPDATED,
                target_type=AuditTargetType.CLINIC,
                target_id=clinique.id,
                now=self._clock.now(),
                details={"name": cmd.name},
            )
            await uow.commit()
            effectif = await uow.directory.count_active_staff(clinique.id)
            return to_admin_clinic_detail(clinique, effectif)


class SetAdminClinicStatus:
    """Suspend ou reactive une clinique. IDEMPOTENT.

    Suspendre une clinique deja suspendue renvoie l'etat courant sans erreur,
    sans evenement et sans ligne d'audit : un double-clic sur un bouton ne
    doit ni afficher une alerte rouge, ni remplir le journal de faits qui ne
    se sont pas produits. C'est l'entite qui porte cette idempotence (elle
    renvoie None quand rien n'a change), pas ce use case -- ainsi la regle
    vaut pour tous les appelants presents et futurs.
    """

    def __init__(self, uow_factory: IdentityUoWFactory, clock: Clock) -> None:
        self._uow_factory = uow_factory
        self._clock = clock

    async def execute(
        self, clinic_id: uuid.UUID, *, active: bool, actor: AdminActor
    ) -> AdminClinicDetail:
        now = self._clock.now()
        async with self._uow_factory() as uow:
            clinique = await uow.clinics.get_by_id(clinic_id)
            if clinique is None:
                raise ClinicNotFoundError("Clinique introuvable.")

            evenement = clinique.reactivate(now) if active else clinique.suspend(now)
            if evenement is not None:
                await uow.clinics.update(clinique)
                uow.add_event(evenement)
                await _tracer(
                    uow,
                    actor=actor,
                    action=(
                        AuditAction.CLINIC_REACTIVATED if active else AuditAction.CLINIC_SUSPENDED
                    ),
                    target_type=AuditTargetType.CLINIC,
                    target_id=clinique.id,
                    now=now,
                )
                await uow.commit()

            effectif = await uow.directory.count_active_staff(clinique.id)
            return to_admin_clinic_detail(clinique, effectif)
