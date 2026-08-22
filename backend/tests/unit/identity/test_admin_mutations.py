"""Tests des use cases d'ECRITURE du back-office, sur fakes.

Ce que ces tests verrouillent, dans l'ordre d'importance :

1. le GARDE-FOU DU DERNIER GERANT. Retrograder ou desactiver le dernier
   gerant actif rendrait la clinique ingouvernable, et c'est un etat dont on
   ne sort pas depuis l'interface ;
2. l'IDEMPOTENCE des changements de statut : un double-clic ne doit produire
   ni erreur, ni evenement, ni ligne d'audit ;
3. la TRACABILITE : chaque mutation laisse une ligne d'audit, avec le bon
   acteur -- et jamais de secret dedans ;
4. le mot de passe GENERE, renvoye une seule fois, et reellement conforme a
   la politique du projet.
"""

import uuid
from datetime import UTC, datetime

import pytest

from tests.unit.identity.fakes import (
    FakeBreachChecker,
    FakeHasher,
    FakeIdentityUnitOfWork,
    FixedClock,
)
from vetolib.identity.application.dto import (
    AdminActor,
    AdminCreateClinicCommand,
    AdminCreateClinicManager,
    AdminCreateStaffCommand,
    AdminUpdateClinicCommand,
    AdminUpdateOwnerCommand,
)
from vetolib.identity.application.use_cases.admin import (
    ChangeAdminStaffRole,
    CreateAdminClinic,
    CreateAdminStaff,
    GetAdminOwner,
    SetAdminClinicStatus,
    SetAdminOwnerStatus,
    SetAdminStaffStatus,
    UpdateAdminClinic,
    UpdateAdminOwner,
)
from vetolib.identity.domain.admin_audit import AuditAction
from vetolib.identity.domain.clinic import Clinic
from vetolib.identity.domain.errors import (
    ClinicNotFoundError,
    EmailAlreadyExistsError,
    LastManagerError,
    OwnerNotFoundError,
)
from vetolib.identity.domain.owner import Owner
from vetolib.identity.domain.user import User
from vetolib.identity.domain.value_objects import (
    PASSWORD_MIN_LENGTH,
    Email,
    HashedPassword,
    Role,
)

_NOW = datetime(2026, 8, 22, 9, 0, tzinfo=UTC)
_ACTEUR = AdminActor(
    id=uuid.UUID("00000000-0000-0000-0000-0000000000a1"), email="fondateur@vetolib.fr"
)


def _horloge() -> FixedClock:
    return FixedClock(_NOW)


def _creation(**surcharges: object) -> AdminCreateClinicCommand:
    defauts: dict[str, object] = {
        "name": "Clinique des Lilas",
        "email": "contact@lilas.fr",
        "phone": None,
        "address_line1": None,
        "address_line2": None,
        "postal_code": None,
        "city": None,
        "country": None,
        "timezone": "Europe/Paris",
        "manager": None,
    }
    defauts.update(surcharges)
    return AdminCreateClinicCommand(**defauts)  # type: ignore[arg-type]


def _use_case_creation(uow: FakeIdentityUnitOfWork) -> CreateAdminClinic:
    return CreateAdminClinic(lambda: uow, FakeHasher(), _horloge(), FakeBreachChecker())


def _clinique_avec_gerant(
    uow: FakeIdentityUnitOfWork, *, role: Role = Role.MANAGER, actif: bool = True
) -> tuple[Clinic, User]:
    clinique = Clinic(
        id=uuid.uuid4(),
        created_at=_NOW,
        name="Clinique des Lilas",
        email=Email("contact@lilas.fr"),
        phone=None,
    )
    uow.clinic_store[clinique.id] = clinique
    membre = User(
        id=uuid.uuid4(),
        created_at=_NOW,
        clinic_id=clinique.id,
        email=Email("gerant@lilas.fr"),
        hashed_password=HashedPassword("h:x"),
        first_name="Ana",
        last_name="Martin",
        role=role,
        is_active=actif,
    )
    uow.user_store[membre.id] = membre
    return clinique, membre


# --- Creation ----------------------------------------------------------------


async def test_creer_une_clinique_seule() -> None:
    uow = FakeIdentityUnitOfWork()

    fiche, gerant = await _use_case_creation(uow).execute(_creation(), _ACTEUR)

    assert fiche.name == "Clinique des Lilas"
    assert fiche.staff_count == 0
    # Pas de bloc gerant demande : on n'en invente pas un.
    assert gerant is None
    assert uow.commits == 1


async def test_creer_une_clinique_et_son_premier_gerant_en_une_transaction() -> None:
    uow = FakeIdentityUnitOfWork()

    fiche, gerant = await _use_case_creation(uow).execute(
        _creation(
            manager=AdminCreateClinicManager(
                email="marie.durand@lilas.fr",
                first_name="Marie",
                last_name="Durand",
                role=Role.MANAGER,
            )
        ),
        _ACTEUR,
    )

    assert gerant is not None
    assert gerant.role is Role.MANAGER
    assert fiche.staff_count == 1
    # UN seul commit : la clinique et son gerant partent ensemble, ou pas du tout.
    assert uow.commits == 1
    # L'email de la clinique et celui du gerant sont DISTINCTS -- c'est
    # precisement ce que l'inscription publique ne sait pas faire.
    assert fiche.email == "contact@lilas.fr"
    assert gerant.email == "marie.durand@lilas.fr"


async def test_le_mot_de_passe_genere_respecte_la_politique_du_projet() -> None:
    uow = FakeIdentityUnitOfWork()

    _, gerant = await _use_case_creation(uow).execute(
        _creation(
            manager=AdminCreateClinicManager(
                email="marie@lilas.fr", first_name="M", last_name="D", role=Role.MANAGER
            )
        ),
        _ACTEUR,
    )

    assert gerant is not None
    assert len(gerant.temporary_password) >= PASSWORD_MIN_LENGTH
    # Phrase de passe dictable : des mots separes par des tirets, pas une
    # chaine aleatoire qu'on recopierait de travers au telephone.
    assert gerant.temporary_password.count("-") == 4


async def test_la_verification_anti_compromission_est_appliquee_meme_au_mot_de_passe_genere() -> (
    None
):
    """Aucun chemin du code ne doit mener a une empreinte stockee sans etre
    passe par la politique complete -- meme quand le secret vient de nous."""
    uow = FakeIdentityUnitOfWork()
    breaches = FakeBreachChecker()
    use_case = CreateAdminClinic(lambda: uow, FakeHasher(), _horloge(), breaches)

    await use_case.execute(
        _creation(
            manager=AdminCreateClinicManager(
                email="marie@lilas.fr", first_name="M", last_name="D", role=Role.MANAGER
            )
        ),
        _ACTEUR,
    )

    assert len(breaches.calls) == 1


async def test_un_email_de_gerant_deja_pris_refuse_toute_la_creation() -> None:
    uow = FakeIdentityUnitOfWork()
    _, existant = _clinique_avec_gerant(uow)

    with pytest.raises(EmailAlreadyExistsError):
        await _use_case_creation(uow).execute(
            _creation(
                email="autre@exemple.fr",
                manager=AdminCreateClinicManager(
                    email=existant.email.value,
                    first_name="M",
                    last_name="D",
                    role=Role.MANAGER,
                ),
            ),
            _ACTEUR,
        )
    # Rien n'a ete commite : la clinique n'existe pas non plus.
    assert uow.commits == 0


async def test_la_creation_laisse_deux_lignes_d_audit() -> None:
    uow = FakeIdentityUnitOfWork()

    await _use_case_creation(uow).execute(
        _creation(
            manager=AdminCreateClinicManager(
                email="marie@lilas.fr", first_name="M", last_name="D", role=Role.MANAGER
            )
        ),
        _ACTEUR,
    )

    actions = [e.action for e in uow.audit_entries]
    assert actions == [AuditAction.CLINIC_CREATED, AuditAction.STAFF_CREATED]
    assert all(e.actor_email == "fondateur@vetolib.fr" for e in uow.audit_entries)
    # Aucun secret dans le journal : il est destine a etre lu.
    assert all("password" not in str(e.details) for e in uow.audit_entries)


# --- Mise a jour et statut ---------------------------------------------------


async def test_mettre_a_jour_une_clinique_inconnue_donne_404() -> None:
    uow = FakeIdentityUnitOfWork()

    with pytest.raises(ClinicNotFoundError):
        await UpdateAdminClinic(lambda: uow, _horloge()).execute(
            AdminUpdateClinicCommand(
                clinic_id=uuid.uuid4(),
                name="Peu importe",
                phone=None,
                address_line1=None,
                address_line2=None,
                postal_code=None,
                city=None,
                country=None,
                timezone="Europe/Paris",
            ),
            _ACTEUR,
        )


async def test_suspendre_puis_resuspendre_est_idempotent() -> None:
    uow = FakeIdentityUnitOfWork()
    clinique, _ = _clinique_avec_gerant(uow)
    use_case = SetAdminClinicStatus(lambda: uow, _horloge())

    premiere = await use_case.execute(clinique.id, active=False, actor=_ACTEUR)
    seconde = await use_case.execute(clinique.id, active=False, actor=_ACTEUR)

    assert premiere.is_active is False
    assert seconde.is_active is False
    # Un seul commit, un seul evenement, une seule ligne d'audit : le second
    # appel n'a rien produit du tout.
    assert uow.commits == 1
    assert len(uow.events) == 1
    assert len(uow.audit_entries) == 1


async def test_reactiver_retablit_et_trace() -> None:
    uow = FakeIdentityUnitOfWork()
    clinique, _ = _clinique_avec_gerant(uow)
    use_case = SetAdminClinicStatus(lambda: uow, _horloge())
    await use_case.execute(clinique.id, active=False, actor=_ACTEUR)

    fiche = await use_case.execute(clinique.id, active=True, actor=_ACTEUR)

    assert fiche.is_active is True
    assert [e.action for e in uow.audit_entries] == [
        AuditAction.CLINIC_SUSPENDED,
        AuditAction.CLINIC_REACTIVATED,
    ]


# --- Garde-fou du dernier gerant ---------------------------------------------


async def test_retrograder_le_dernier_gerant_est_refuse() -> None:
    uow = FakeIdentityUnitOfWork()
    _, gerant = _clinique_avec_gerant(uow)

    with pytest.raises(LastManagerError):
        await ChangeAdminStaffRole(lambda: uow, _horloge()).execute(
            gerant.id, role=Role.ASV, actor=_ACTEUR
        )
    assert uow.user_store[gerant.id].role is Role.MANAGER


async def test_desactiver_le_dernier_gerant_est_refuse() -> None:
    uow = FakeIdentityUnitOfWork()
    _, gerant = _clinique_avec_gerant(uow)

    with pytest.raises(LastManagerError):
        await SetAdminStaffStatus(lambda: uow, _horloge()).execute(
            gerant.id, active=False, actor=_ACTEUR
        )
    assert uow.user_store[gerant.id].is_active is True


async def test_retrograder_un_gerant_est_possible_s_il_en_reste_un_autre() -> None:
    uow = FakeIdentityUnitOfWork()
    clinique, premier = _clinique_avec_gerant(uow)
    second = User(
        id=uuid.uuid4(),
        created_at=_NOW,
        clinic_id=clinique.id,
        email=Email("second@lilas.fr"),
        hashed_password=HashedPassword("h:x"),
        first_name="Bob",
        last_name="Second",
        role=Role.MANAGER,
    )
    uow.user_store[second.id] = second

    ligne = await ChangeAdminStaffRole(lambda: uow, _horloge()).execute(
        premier.id, role=Role.ASV, actor=_ACTEUR
    )

    assert ligne.role is Role.ASV
    assert [e.action for e in uow.audit_entries] == [AuditAction.STAFF_ROLE_CHANGED]
    assert uow.audit_entries[0].details == {"from": "manager", "to": "asv"}


async def test_retrograder_un_asv_ne_declenche_aucun_garde_fou() -> None:
    uow = FakeIdentityUnitOfWork()
    _, membre = _clinique_avec_gerant(uow, role=Role.ASV)

    ligne = await ChangeAdminStaffRole(lambda: uow, _horloge()).execute(
        membre.id, role=Role.VETERINARIAN, actor=_ACTEUR
    )

    assert ligne.role is Role.VETERINARIAN


async def test_changer_un_role_pour_le_meme_ne_fait_rien() -> None:
    uow = FakeIdentityUnitOfWork()
    _, gerant = _clinique_avec_gerant(uow)

    await ChangeAdminStaffRole(lambda: uow, _horloge()).execute(
        gerant.id, role=Role.MANAGER, actor=_ACTEUR
    )

    assert uow.commits == 0
    assert uow.audit_entries == []


# --- Creation de personnel ---------------------------------------------------


async def test_creer_un_membre_du_personnel_dans_une_clinique_existante() -> None:
    uow = FakeIdentityUnitOfWork()
    clinique, _ = _clinique_avec_gerant(uow)
    use_case = CreateAdminStaff(lambda: uow, FakeHasher(), _horloge(), FakeBreachChecker())

    cree = await use_case.execute(
        AdminCreateStaffCommand(
            clinic_id=clinique.id,
            email="nouveau@lilas.fr",
            first_name="Nina",
            last_name="Nouvelle",
            role=Role.VETERINARIAN,
        ),
        _ACTEUR,
    )

    assert cree.role is Role.VETERINARIAN
    assert len(cree.temporary_password) >= PASSWORD_MIN_LENGTH
    assert [e.action for e in uow.audit_entries] == [AuditAction.STAFF_CREATED]


async def test_creer_un_membre_dans_une_clinique_inconnue_donne_404() -> None:
    uow = FakeIdentityUnitOfWork()
    use_case = CreateAdminStaff(lambda: uow, FakeHasher(), _horloge(), FakeBreachChecker())

    with pytest.raises(ClinicNotFoundError):
        await use_case.execute(
            AdminCreateStaffCommand(
                clinic_id=uuid.uuid4(),
                email="nouveau@exemple.fr",
                first_name="Nina",
                last_name="Nouvelle",
                role=Role.ASV,
            ),
            _ACTEUR,
        )


# --- Proprietaires -----------------------------------------------------------


def _proprietaire(uow: FakeIdentityUnitOfWork, *, actif: bool = True) -> Owner:
    proprietaire = Owner(
        id=uuid.uuid4(),
        created_at=_NOW,
        email=Email("ana@exemple.fr"),
        hashed_password=HashedPassword("h:x"),
        first_name="Ana",
        last_name="Martin",
        is_active=actif,
    )
    uow.owner_store[proprietaire.id] = proprietaire
    return proprietaire


def _mise_a_jour_proprietaire(owner_id: uuid.UUID, **surcharges: object) -> AdminUpdateOwnerCommand:
    defauts: dict[str, object] = {
        "owner_id": owner_id,
        "first_name": "Ana",
        "last_name": "Martin",
        "phone": None,
        "address_line1": None,
        "address_line2": None,
        "postal_code": None,
        "city": None,
        "country": None,
        "notify_email": True,
        "notify_sms": False,
    }
    defauts.update(surcharges)
    return AdminUpdateOwnerCommand(**defauts)  # type: ignore[arg-type]


async def test_lire_la_fiche_d_un_proprietaire_avec_son_nombre_d_animaux() -> None:
    uow = FakeIdentityUnitOfWork()
    proprietaire = _proprietaire(uow)
    uow.pet_counts[proprietaire.id] = 2

    fiche = await GetAdminOwner(lambda: uow).execute(proprietaire.id)

    assert fiche.email == "ana@exemple.fr"
    assert fiche.pet_count == 2


async def test_lire_un_proprietaire_inconnu_donne_404() -> None:
    uow = FakeIdentityUnitOfWork()

    with pytest.raises(OwnerNotFoundError):
        await GetAdminOwner(lambda: uow).execute(uuid.uuid4())


async def test_mettre_a_jour_une_fiche_de_proprietaire() -> None:
    uow = FakeIdentityUnitOfWork()
    proprietaire = _proprietaire(uow)

    fiche = await UpdateAdminOwner(lambda: uow, _horloge()).execute(
        _mise_a_jour_proprietaire(
            proprietaire.id,
            first_name="Anaïs",
            phone="0102030405",
            address_line1="12 rue des Lilas",
            postal_code="75011",
            city="Paris",
            notify_sms=True,
        ),
        _ACTEUR,
    )

    assert fiche.first_name == "Anaïs"
    assert fiche.phone == "0102030405"
    assert fiche.address is not None
    assert fiche.address.city == "Paris"
    assert fiche.notification_preferences.sms is True
    # L'email n'est pas dans la commande : il ne peut pas changer.
    assert fiche.email == "ana@exemple.fr"
    assert [e.action for e in uow.audit_entries] == [AuditAction.OWNER_UPDATED]


async def test_mettre_a_jour_un_proprietaire_inconnu_donne_404() -> None:
    uow = FakeIdentityUnitOfWork()

    with pytest.raises(OwnerNotFoundError):
        await UpdateAdminOwner(lambda: uow, _horloge()).execute(
            _mise_a_jour_proprietaire(uuid.uuid4()), _ACTEUR
        )


async def test_desactiver_puis_redesactiver_un_proprietaire_est_idempotent() -> None:
    uow = FakeIdentityUnitOfWork()
    proprietaire = _proprietaire(uow)
    use_case = SetAdminOwnerStatus(lambda: uow, _horloge())

    premiere = await use_case.execute(proprietaire.id, active=False, actor=_ACTEUR)
    seconde = await use_case.execute(proprietaire.id, active=False, actor=_ACTEUR)

    assert premiere.is_active is False
    assert seconde.is_active is False
    assert uow.commits == 1
    assert len(uow.events) == 1
    assert [e.action for e in uow.audit_entries] == [AuditAction.OWNER_DEACTIVATED]


async def test_reactiver_un_proprietaire() -> None:
    uow = FakeIdentityUnitOfWork()
    proprietaire = _proprietaire(uow, actif=False)

    fiche = await SetAdminOwnerStatus(lambda: uow, _horloge()).execute(
        proprietaire.id, active=True, actor=_ACTEUR
    )

    assert fiche.is_active is True
    assert [e.action for e in uow.audit_entries] == [AuditAction.OWNER_REACTIVATED]


async def test_changer_le_statut_d_un_proprietaire_inconnu_donne_404() -> None:
    uow = FakeIdentityUnitOfWork()

    with pytest.raises(OwnerNotFoundError):
        await SetAdminOwnerStatus(lambda: uow, _horloge()).execute(
            uuid.uuid4(), active=False, actor=_ACTEUR
        )
