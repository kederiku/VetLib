"""Tests des use cases de lecture du back-office, sur fakes.

Le fake de repertoire reproduit fidelement la semantique du SQL (filtre soft
delete, statut, recherche insensible casse/accents, tri avec departage,
total calcule AVANT tranchage). Ces tests verrouillent donc le CONTRAT que
l'infrastructure doit respecter -- les memes proprietes sont re-verifiees
contre un vrai PostgreSQL dans tests/integration.
"""

import uuid
from datetime import UTC, datetime

from tests.unit.identity.fakes import FakeIdentityUnitOfWork
from vetolib.identity.application.use_cases.admin import (
    GetPlatformStats,
    ListAdminClinics,
    ListAdminOwners,
    ListAdminStaff,
)
from vetolib.identity.domain.clinic import Clinic
from vetolib.identity.domain.owner import Owner
from vetolib.identity.domain.repositories import (
    ClinicSearchCriteria,
    ClinicSortField,
    OwnerSearchCriteria,
    StaffSearchCriteria,
)
from vetolib.identity.domain.user import User
from vetolib.identity.domain.value_objects import (
    AccountStatus,
    Address,
    Email,
    HashedPassword,
    Role,
)
from vetolib.shared.domain.page import SortDirection

_NOW = datetime(2026, 8, 22, 9, 0, tzinfo=UTC)


def _clinique(
    uow: FakeIdentityUnitOfWork,
    nom: str,
    *,
    email: str | None = None,
    ville: str | None = None,
    active: bool = True,
) -> Clinic:
    clinique = Clinic(
        id=uuid.uuid4(),
        created_at=_NOW,
        name=nom,
        email=Email(email or f"{nom.lower().replace(' ', '-')}@exemple.fr"),
        phone=None,
        address=(
            None
            if ville is None
            else Address(line1="1 rue du Test", line2=None, postal_code="75001", city=ville)
        ),
        is_active=active,
    )
    uow.clinic_store[clinique.id] = clinique
    return clinique


def _membre(
    uow: FakeIdentityUnitOfWork,
    clinique: Clinic,
    nom: str,
    *,
    role: Role = Role.ASV,
    active: bool = True,
) -> User:
    membre = User(
        id=uuid.uuid4(),
        created_at=_NOW,
        clinic_id=clinique.id,
        email=Email(f"{nom.lower()}@{clinique.name.lower().replace(' ', '-')}.fr"),
        hashed_password=HashedPassword("h:x"),
        first_name=nom,
        last_name="Test",
        role=role,
        is_active=active,
    )
    uow.user_store[membre.id] = membre
    return membre


def _proprietaire(
    uow: FakeIdentityUnitOfWork, prenom: str, nom: str, *, active: bool = True
) -> Owner:
    proprietaire = Owner(
        id=uuid.uuid4(),
        created_at=_NOW,
        email=Email(f"{prenom.lower()}.{nom.lower()}@exemple.fr"),
        hashed_password=HashedPassword("h:x"),
        first_name=prenom,
        last_name=nom,
        is_active=active,
    )
    uow.owner_store[proprietaire.id] = proprietaire
    return proprietaire


# --- Cliniques ---------------------------------------------------------------


async def test_la_liste_trie_et_compte_l_effectif_actif() -> None:
    uow = FakeIdentityUnitOfWork()
    lilas = _clinique(uow, "Clinique des Lilas")
    _clinique(uow, "Clinique du Parc")
    _membre(uow, lilas, "Ana")
    _membre(uow, lilas, "Bob")
    # Un compte desactive NE compte PAS dans l'effectif : c'est ce nombre que
    # le dialogue de suspension annonce, il doit dire la verite.
    _membre(uow, lilas, "Cyril", active=False)

    page = await ListAdminClinics(lambda: uow).execute(ClinicSearchCriteria())

    assert [c.name for c in page.items] == ["Clinique des Lilas", "Clinique du Parc"]
    assert page.items[0].staff_count == 2
    assert page.total == 2


async def test_la_recherche_ignore_la_casse_et_les_accents() -> None:
    uow = FakeIdentityUnitOfWork()
    _clinique(uow, "Clinique Vétérinaire du Château")
    _clinique(uow, "Clinique du Parc")

    page = await ListAdminClinics(lambda: uow).execute(ClinicSearchCriteria(search="veterinaire"))

    assert [c.name for c in page.items] == ["Clinique Vétérinaire du Château"]


async def test_la_recherche_couvre_aussi_l_email_et_la_ville() -> None:
    uow = FakeIdentityUnitOfWork()
    _clinique(uow, "Clinique A", email="contact@lilas.fr", ville="Lyon")
    _clinique(uow, "Clinique B", email="contact@parc.fr", ville="Paris")

    par_email = await ListAdminClinics(lambda: uow).execute(ClinicSearchCriteria(search="lilas"))
    par_ville = await ListAdminClinics(lambda: uow).execute(ClinicSearchCriteria(search="lyon"))

    assert [c.name for c in par_email.items] == ["Clinique A"]
    assert [c.name for c in par_ville.items] == ["Clinique A"]


async def test_un_terme_contenant_un_joker_est_pris_au_pied_de_la_lettre() -> None:
    """Sans echappement, "%" ferait correspondre toutes les lignes."""
    uow = FakeIdentityUnitOfWork()
    _clinique(uow, "Clinique des Lilas")

    page = await ListAdminClinics(lambda: uow).execute(ClinicSearchCriteria(search="%"))

    assert page.items == []
    assert page.total == 0


async def test_le_filtre_de_statut_separe_actives_et_suspendues() -> None:
    uow = FakeIdentityUnitOfWork()
    _clinique(uow, "Active")
    _clinique(uow, "Suspendue", active=False)

    actives = await ListAdminClinics(lambda: uow).execute(
        ClinicSearchCriteria(status=AccountStatus.ACTIVE)
    )
    suspendues = await ListAdminClinics(lambda: uow).execute(
        ClinicSearchCriteria(status=AccountStatus.INACTIVE)
    )
    toutes = await ListAdminClinics(lambda: uow).execute(ClinicSearchCriteria())

    assert [c.name for c in actives.items] == ["Active"]
    assert [c.name for c in suspendues.items] == ["Suspendue"]
    # Absence de filtre = les deux : "tous" n'est PAS une troisieme valeur
    # d'enum, sinon deux facons d'ecrire la meme chose coexisteraient.
    assert toutes.total == 2


async def test_le_total_est_celui_du_filtre_pas_de_la_page() -> None:
    """LE piege de la pagination : c'est ce total qui alimente "x sur N"."""
    uow = FakeIdentityUnitOfWork()
    for index in range(5):
        _clinique(uow, f"Clinique {index}")

    page = await ListAdminClinics(lambda: uow).execute(ClinicSearchCriteria(limit=2, offset=2))

    assert len(page.items) == 2
    assert page.total == 5
    assert [c.name for c in page.items] == ["Clinique 2", "Clinique 3"]


async def test_une_page_au_dela_de_la_fin_garde_le_bon_total() -> None:
    """C'est le cas que `count(*) OVER ()` aurait casse en renvoyant 0."""
    uow = FakeIdentityUnitOfWork()
    for index in range(3):
        _clinique(uow, f"Clinique {index}")

    page = await ListAdminClinics(lambda: uow).execute(ClinicSearchCriteria(limit=20, offset=100))

    assert page.items == []
    assert page.total == 3


async def test_le_tri_descendant_inverse_l_ordre() -> None:
    uow = FakeIdentityUnitOfWork()
    _clinique(uow, "Alpha")
    _clinique(uow, "Zeta")

    page = await ListAdminClinics(lambda: uow).execute(
        ClinicSearchCriteria(sort_by=ClinicSortField.NAME, sort_dir=SortDirection.DESC)
    )

    assert [c.name for c in page.items] == ["Zeta", "Alpha"]


# --- Proprietaires -----------------------------------------------------------


async def test_la_recherche_de_proprietaires_accepte_le_nom_complet() -> None:
    """Taper "jean dupont" d'une traite doit marcher : c'est ce que tout le
    monde fait, et un OR sur les deux champs separes n'y suffirait pas."""
    uow = FakeIdentityUnitOfWork()
    _proprietaire(uow, "Jean", "Dupont")
    _proprietaire(uow, "Marie", "Martin")

    page = await ListAdminOwners(lambda: uow).execute(OwnerSearchCriteria(search="jean dupont"))

    assert [o.last_name for o in page.items] == ["Dupont"]


async def test_le_nombre_d_animaux_accompagne_chaque_proprietaire() -> None:
    uow = FakeIdentityUnitOfWork()
    proprietaire = _proprietaire(uow, "Ana", "Martin")
    uow.pet_counts[proprietaire.id] = 3

    page = await ListAdminOwners(lambda: uow).execute(OwnerSearchCriteria())

    assert page.items[0].pet_count == 3


# --- Personnel transverse ----------------------------------------------------


async def test_la_liste_du_personnel_traverse_les_cliniques() -> None:
    """LA propriete de cet espace : une seule liste, deux cliniques."""
    uow = FakeIdentityUnitOfWork()
    lilas = _clinique(uow, "Clinique des Lilas")
    parc = _clinique(uow, "Clinique du Parc")
    _membre(uow, lilas, "Ana")
    _membre(uow, parc, "Bob")

    page = await ListAdminStaff(lambda: uow).execute(StaffSearchCriteria())

    assert page.total == 2
    assert {r.clinic_name for r in page.items} == {
        "Clinique des Lilas",
        "Clinique du Parc",
    }


async def test_le_personnel_se_filtre_par_clinique_et_par_role() -> None:
    uow = FakeIdentityUnitOfWork()
    lilas = _clinique(uow, "Clinique des Lilas")
    parc = _clinique(uow, "Clinique du Parc")
    _membre(uow, lilas, "Ana", role=Role.MANAGER)
    _membre(uow, lilas, "Bob", role=Role.ASV)
    _membre(uow, parc, "Cyril", role=Role.MANAGER)

    par_clinique = await ListAdminStaff(lambda: uow).execute(
        StaffSearchCriteria(clinic_id=lilas.id)
    )
    par_role = await ListAdminStaff(lambda: uow).execute(StaffSearchCriteria(role=Role.MANAGER))

    assert par_clinique.total == 2
    assert par_role.total == 2
    assert {r.first_name for r in par_role.items} == {"Ana", "Cyril"}


async def test_chercher_le_nom_d_une_clinique_sort_son_personnel() -> None:
    uow = FakeIdentityUnitOfWork()
    lilas = _clinique(uow, "Clinique des Lilas")
    parc = _clinique(uow, "Clinique du Parc")
    _membre(uow, lilas, "Ana")
    _membre(uow, parc, "Bob")

    page = await ListAdminStaff(lambda: uow).execute(StaffSearchCriteria(search="Lilas"))

    assert [r.first_name for r in page.items] == ["Ana"]


async def test_la_ligne_de_personnel_signale_une_clinique_suspendue() -> None:
    """Un compte actif dans une clinique suspendue ne peut PAS se connecter :
    l'ecran doit pouvoir le montrer, sinon le statut affiche serait un
    mensonge."""
    uow = FakeIdentityUnitOfWork()
    lilas = _clinique(uow, "Clinique des Lilas", active=False)
    _membre(uow, lilas, "Ana")

    page = await ListAdminStaff(lambda: uow).execute(StaffSearchCriteria())

    assert page.items[0].is_active is True
    assert page.items[0].clinic_is_active is False


# --- Compteurs ---------------------------------------------------------------


async def test_les_compteurs_separent_actifs_et_inactifs() -> None:
    uow = FakeIdentityUnitOfWork()
    lilas = _clinique(uow, "Active")
    _clinique(uow, "Suspendue", active=False)
    _membre(uow, lilas, "Ana")
    _membre(uow, lilas, "Bob", active=False)
    _proprietaire(uow, "Cara", "Client")
    _proprietaire(uow, "Dan", "Client", active=False)

    stats = await GetPlatformStats(lambda: uow).execute()

    assert (stats.active_clinics, stats.suspended_clinics) == (1, 1)
    assert (stats.active_owners, stats.inactive_owners) == (1, 1)
    assert (stats.active_staff, stats.inactive_staff) == (1, 1)
