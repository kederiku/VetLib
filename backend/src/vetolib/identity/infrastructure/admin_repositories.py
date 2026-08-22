"""Lectures TRANSVERSES du back-office plateforme, et journal d'audit.

⚠️ CE FICHIER CONTIENT LES SEULES REQUETES DU PROJET QUI LISENT
VOLONTAIREMENT A TRAVERS TOUS LES TENANTS.

Partout ailleurs, l'isolation multi-tenant est garantie par la base : les
transactions passent par `SET LOCAL ROLE vetolib_app` et la policy RLS
`tenant_isolation` filtre chaque requete, meme si un WHERE est oublie cote
Python. Ici, non. Le back-office affiche par nature le parc entier, il
s'execute donc sous UoW SYSTEME -- le meme mode que le login, mais utilise
pour lire massivement au lieu de resoudre une identite.

Consequence a assumer : dans ce fichier, la seule barriere est le code. Les
compensations vivent ailleurs (dependance d'authentification posee sur le
ROUTEUR, test d'integration qui enumere toutes les routes /api/v1/admin/* et
exige un 401, plafond de taille de page, journalisation) -- voir ADR-0013.
Ce qui reste ici, c'est une regle : aucun use case tenant n'importe ce
module, et toute requete ajoutee doit etre relue avec cette page en tete.

Deux choix techniques valent une explication.

1. DEUX REQUETES (un COUNT puis un SELECT), et non `count(*) OVER ()`.
   La fenetre ne compte que les lignes RENVOYEES : sur une page au-dela de
   la fin -- l'utilisateur etait page 5, il filtre, il ne reste que 2 pages
   -- elle renverrait zero ligne, donc total = 0, et l'ecran afficherait
   "aucun resultat" alors qu'il y en a des centaines, sans moyen de revenir
   en arriere. Il faudrait rattraper le cas par un COUNT de secours,
   c'est-a-dire ecrire les deux chemins quand meme, avec une branche
   rarement exercee. Deux requetes explicites sont toujours correctes.
   L'incoherence theorique entre elles (READ COMMITTED, une ligne inseree
   entre les deux) se traduit par un total decale de un sur un ecran
   d'administration : sans consequence.

2. Une clause WHERE construite UNE FOIS et partagee par le COUNT et le
   SELECT. C'est la raison d'etre des methodes `_conditions_*` : deux
   clauses divergentes donneraient un total qui ne correspond pas aux lignes
   affichees, et personne ne s'en apercevrait avant longtemps.
"""

import uuid
from typing import Any

from sqlalchemy import (
    ColumnElement,
    Row,
    ScalarSelect,
    Select,
    SQLColumnExpression,
    func,
    literal,
    or_,
    select,
)
from sqlalchemy.ext.asyncio import AsyncSession

from vetolib.identity.domain.admin_audit import (
    AdminAuditEntry,
    AuditAction,
    AuditTargetType,
)
from vetolib.identity.domain.repositories import (
    ClinicRow,
    ClinicSearchCriteria,
    ClinicSortField,
    OwnerRow,
    OwnerSearchCriteria,
    OwnerSortField,
    PlatformStats,
    StaffRow,
    StaffSearchCriteria,
    StaffSortField,
)
from vetolib.identity.domain.value_objects import AccountStatus, Role
from vetolib.identity.infrastructure.models import (
    AdminAuditLogModel,
    ClinicModel,
    OwnerModel,
    UserModel,
)
from vetolib.identity.infrastructure.repositories import (
    _clinic_to_entity,
    _owner_to_entity,
)
from vetolib.patients.infrastructure.models import PetModel
from vetolib.shared.domain.page import Page, SortDirection

# Type des expressions de colonne acceptees par les helpers ci-dessous.
# SQLColumnExpression et non ColumnElement : les attributs d'un modele
# SQLAlchemy sont des InstrumentedAttribute, qui n'heritent pas de
# ColumnElement dans les annotations de la bibliotheque. SQLColumnExpression
# est le type public prevu pour "tout ce qui s'utilise comme une colonne", et
# il couvre les deux. Le parametre Any est assume : c'est SQLAlchemy qui
# valide la composition des expressions, pas mypy.
type Colonne = SQLColumnExpression[Any]


def _echapper_like(terme: str) -> str:
    """Neutralise les jokers SQL d'une saisie utilisateur.

    Ce n'est PAS une protection contre l'injection -- la valeur reste un
    parametre lie par SQLAlchemy -- mais contre un resultat FAUX : sans
    echappement, taper "%" ferait correspondre toutes les lignes, "_"
    n'importe quel caractere, et la requete degenererait en parcours complet.

    L'antislash est echappe EN PREMIER : dans l'autre sens, on echapperait
    ensuite les antislashs qu'on vient d'ajouter. Bug classique.
    """
    return terme.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _normalise(colonne: Colonne) -> Colonne:
    """lower() + unaccent() : recherche insensible a la casse ET aux accents.

    ILIKE couvre la casse mais pas les accents. Sur un produit francais,
    chercher "veterinaire" doit trouver "Clinique Veterinaire des Lilas"
    ecrite avec l'accent -- c'est la moitie des recherches reelles.
    L'extension unaccent est installee par la migration 0009.

    Contrepartie assumee : unaccent() est declaree STABLE et non IMMUTABLE,
    cette expression n'est donc pas indexable telle quelle. On ne l'indexe
    pas a ce stade ; le seuil et la marche a suivre sont ecrits dans la
    docstring de la migration.
    """
    return func.unaccent(func.lower(colonne))


def _motif(terme: str) -> Colonne:
    """Motif LIKE normalise, pret a etre compare a une colonne normalisee."""
    return _normalise(literal(f"%{_echapper_like(terme)}%"))


def _filtre_statut(colonne: Colonne, statut: AccountStatus) -> ColumnElement[bool]:
    """Traduit le filtre metier en predicat SQL."""
    return colonne.is_(statut is AccountStatus.ACTIVE)


# Listes BLANCHES de tri : le dictionnaire est la seule porte entre un enum
# du domaine et une colonne SQL. Une valeur hors enum ne peut pas y entrer,
# donc aucune chaine utilisateur n'atteint jamais l'ORDER BY.
_TRI_CLINIQUES: dict[ClinicSortField, Colonne] = {
    ClinicSortField.NAME: ClinicModel.name,
    ClinicSortField.EMAIL: ClinicModel.email,
    ClinicSortField.CITY: ClinicModel.city,
    ClinicSortField.CREATED_AT: ClinicModel.created_at,
}

_TRI_PROPRIETAIRES: dict[OwnerSortField, Colonne] = {
    OwnerSortField.LAST_NAME: OwnerModel.last_name,
    OwnerSortField.EMAIL: OwnerModel.email,
    OwnerSortField.CREATED_AT: OwnerModel.created_at,
}

_TRI_PERSONNEL: dict[StaffSortField, Colonne] = {
    StaffSortField.LAST_NAME: UserModel.last_name,
    StaffSortField.EMAIL: UserModel.email,
    StaffSortField.ROLE: UserModel.role,
    StaffSortField.CLINIC_NAME: ClinicModel.name,
    StaffSortField.CREATED_AT: UserModel.created_at,
}


def _ordonner(
    requete: Select[Any],
    colonne: Colonne,
    sens: SortDirection,
    departage: Colonne,
) -> Select[Any]:
    """Applique le tri demande, PUIS un departage stable.

    Le departage n'est pas un detail : sans lui, deux lignes de meme nom ont
    un ordre INDEFINI que PostgreSQL est libre de changer d'une requete a
    l'autre. La meme ligne peut alors apparaitre sur deux pages consecutives,
    ou etre sautee -- un bug qui ne se reproduit jamais quand on le cherche.
    """
    expression = colonne.desc() if sens is SortDirection.DESC else colonne.asc()
    return requete.order_by(expression, departage)


class SqlAlchemyAdminDirectoryRepository:
    """Implemente le port AdminDirectoryRepository (lectures cross-tenant)."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # --- Cliniques ---------------------------------------------------------

    def _conditions_cliniques(self, criteres: ClinicSearchCriteria) -> list[ColumnElement[bool]]:
        conditions: list[ColumnElement[bool]] = [ClinicModel.deleted_at.is_(None)]
        if criteres.status is not None:
            conditions.append(_filtre_statut(ClinicModel.is_active, criteres.status))
        if criteres.search:
            motif = _motif(criteres.search)
            conditions.append(
                or_(
                    _normalise(ClinicModel.name).like(motif, escape="\\"),
                    _normalise(ClinicModel.email).like(motif, escape="\\"),
                    # coalesce : la ville est nullable, et NULL LIKE '%x%'
                    # vaut NULL (donc faux), ce qui exclurait silencieusement
                    # les cliniques sans adresse du OR entier.
                    _normalise(func.coalesce(ClinicModel.city, "")).like(motif, escape="\\"),
                )
            )
        return conditions

    async def search_clinics(self, criteria: ClinicSearchCriteria) -> Page[ClinicRow]:
        conditions = self._conditions_cliniques(criteria)

        total_stmt = select(func.count()).select_from(ClinicModel).where(*conditions)
        total = int((await self._session.execute(total_stmt)).scalar_one())

        # Effectif par clinique : sous-requete correlee plutot qu'un LEFT JOIN
        # + GROUP BY. A cette echelle la difference de cout est nulle, et la
        # requete reste lisible -- un GROUP BY obligerait a agreger toutes
        # les colonnes de la clinique.
        effectif = (
            select(func.count())
            .select_from(UserModel)
            .where(
                UserModel.clinic_id == ClinicModel.id,
                UserModel.deleted_at.is_(None),
                UserModel.is_active.is_(True),
            )
            .correlate(ClinicModel)
            .scalar_subquery()
        )
        page_stmt = (
            _ordonner(
                select(ClinicModel, effectif.label("staff_count")).where(*conditions),
                _TRI_CLINIQUES[criteria.sort_by],
                criteria.sort_dir,
                ClinicModel.id,
            )
            .limit(criteria.limit)
            .offset(criteria.offset)
        )

        lignes = (await self._session.execute(page_stmt)).all()
        return Page(
            items=[
                ClinicRow(clinic=_clinic_to_entity(ligne[0]), staff_count=int(ligne[1]))
                for ligne in lignes
            ],
            total=total,
            limit=criteria.limit,
            offset=criteria.offset,
        )

    # --- Proprietaires -----------------------------------------------------

    def _conditions_proprietaires(self, criteres: OwnerSearchCriteria) -> list[ColumnElement[bool]]:
        conditions: list[ColumnElement[bool]] = [OwnerModel.deleted_at.is_(None)]
        if criteres.status is not None:
            conditions.append(_filtre_statut(OwnerModel.is_active, criteres.status))
        if criteres.search:
            motif = _motif(criteres.search)
            # La concatenation "prenom nom" est indispensable : sans elle,
            # taper "jean dupont" d'une traite ne trouverait rien, alors que
            # c'est exactement ce que tout le monde tape.
            nom_complet = OwnerModel.first_name + " " + OwnerModel.last_name
            conditions.append(
                or_(
                    _normalise(OwnerModel.email).like(motif, escape="\\"),
                    _normalise(OwnerModel.first_name).like(motif, escape="\\"),
                    _normalise(OwnerModel.last_name).like(motif, escape="\\"),
                    _normalise(nom_complet).like(motif, escape="\\"),
                )
            )
        return conditions

    async def search_owners(self, criteria: OwnerSearchCriteria) -> Page[OwnerRow]:
        conditions = self._conditions_proprietaires(criteria)

        total_stmt = select(func.count()).select_from(OwnerModel).where(*conditions)
        total = int((await self._session.execute(total_stmt)).scalar_one())

        animaux = (
            select(func.count())
            .select_from(PetModel)
            .where(PetModel.owner_id == OwnerModel.id, PetModel.deleted_at.is_(None))
            .correlate(OwnerModel)
            .scalar_subquery()
        )
        page_stmt = (
            _ordonner(
                select(OwnerModel, animaux.label("pet_count")).where(*conditions),
                _TRI_PROPRIETAIRES[criteria.sort_by],
                criteria.sort_dir,
                OwnerModel.id,
            )
            .limit(criteria.limit)
            .offset(criteria.offset)
        )

        lignes = (await self._session.execute(page_stmt)).all()
        return Page(
            items=[
                OwnerRow(owner=_owner_to_entity(ligne[0]), pet_count=int(ligne[1]))
                for ligne in lignes
            ],
            total=total,
            limit=criteria.limit,
            offset=criteria.offset,
        )

    # --- Personnel, toutes cliniques confondues ----------------------------

    def _conditions_personnel(self, criteres: StaffSearchCriteria) -> list[ColumnElement[bool]]:
        conditions: list[ColumnElement[bool]] = [
            UserModel.deleted_at.is_(None),
            ClinicModel.deleted_at.is_(None),
        ]
        if criteres.status is not None:
            conditions.append(_filtre_statut(UserModel.is_active, criteres.status))
        if criteres.role is not None:
            conditions.append(UserModel.role == criteres.role.value)
        if criteres.clinic_id is not None:
            conditions.append(UserModel.clinic_id == criteres.clinic_id)
        if criteres.search:
            motif = _motif(criteres.search)
            nom_complet = UserModel.first_name + " " + UserModel.last_name
            conditions.append(
                or_(
                    _normalise(UserModel.email).like(motif, escape="\\"),
                    _normalise(UserModel.first_name).like(motif, escape="\\"),
                    _normalise(UserModel.last_name).like(motif, escape="\\"),
                    _normalise(nom_complet).like(motif, escape="\\"),
                    # Le nom de la clinique fait partie de la recherche :
                    # taper "Lilas" doit sortir tout son personnel. C'est ce
                    # qui impose la jointure -- laquelle sert de toute facon
                    # a afficher la colonne "Clinique".
                    _normalise(ClinicModel.name).like(motif, escape="\\"),
                )
            )
        return conditions

    async def search_staff(self, criteria: StaffSearchCriteria) -> Page[StaffRow]:
        conditions = self._conditions_personnel(criteria)
        jointure = UserModel.__table__.join(
            ClinicModel.__table__, UserModel.clinic_id == ClinicModel.id
        )

        total_stmt = select(func.count()).select_from(jointure).where(*conditions)
        total = int((await self._session.execute(total_stmt)).scalar_one())

        page_stmt = (
            _ordonner(
                select(
                    UserModel.id,
                    UserModel.clinic_id,
                    ClinicModel.name.label("clinic_name"),
                    ClinicModel.is_active.label("clinic_is_active"),
                    UserModel.email,
                    UserModel.first_name,
                    UserModel.last_name,
                    UserModel.role,
                    UserModel.is_active,
                    UserModel.created_at,
                )
                .select_from(jointure)
                .where(*conditions),
                _TRI_PERSONNEL[criteria.sort_by],
                criteria.sort_dir,
                UserModel.id,
            )
            .limit(criteria.limit)
            .offset(criteria.offset)
        )

        lignes = (await self._session.execute(page_stmt)).all()
        return Page(
            items=[_vers_staff_row(ligne) for ligne in lignes],
            total=total,
            limit=criteria.limit,
            offset=criteria.offset,
        )

    async def get_staff_row(self, user_id: uuid.UUID) -> StaffRow | None:
        jointure = UserModel.__table__.join(
            ClinicModel.__table__, UserModel.clinic_id == ClinicModel.id
        )
        stmt = (
            select(
                UserModel.id,
                UserModel.clinic_id,
                ClinicModel.name.label("clinic_name"),
                ClinicModel.is_active.label("clinic_is_active"),
                UserModel.email,
                UserModel.first_name,
                UserModel.last_name,
                UserModel.role,
                UserModel.is_active,
                UserModel.created_at,
            )
            .select_from(jointure)
            .where(UserModel.id == user_id, UserModel.deleted_at.is_(None))
        )
        ligne = (await self._session.execute(stmt)).one_or_none()
        return None if ligne is None else _vers_staff_row(ligne)

    async def count_active_staff(self, clinic_id: uuid.UUID) -> int:
        stmt = (
            select(func.count())
            .select_from(UserModel)
            .where(
                UserModel.clinic_id == clinic_id,
                UserModel.deleted_at.is_(None),
                UserModel.is_active.is_(True),
            )
        )
        return int((await self._session.execute(stmt)).scalar_one())

    async def count_active_managers(self, clinic_id: uuid.UUID) -> int:
        stmt = (
            select(func.count())
            .select_from(UserModel)
            .where(
                UserModel.clinic_id == clinic_id,
                UserModel.deleted_at.is_(None),
                UserModel.is_active.is_(True),
                UserModel.role == Role.MANAGER.value,
            )
        )
        return int((await self._session.execute(stmt)).scalar_one())

    # --- Compteurs du tableau de bord --------------------------------------

    async def platform_stats(self) -> PlatformStats:
        """Les six compteurs en UNE requete.

        Six SELECT separes donneraient six instantanes differents : sur un
        ecran ou les nombres se lisent ensemble, ils doivent etre coherents
        entre eux. Un seul SELECT, six sous-requetes.
        """

        def compte(
            modele: type[ClinicModel] | type[OwnerModel] | type[UserModel], actif: bool
        ) -> ScalarSelect[int]:
            return (
                select(func.count())
                .select_from(modele)
                .where(modele.deleted_at.is_(None), modele.is_active.is_(actif))
                .scalar_subquery()
            )

        stmt = select(
            compte(ClinicModel, True),
            compte(ClinicModel, False),
            compte(OwnerModel, True),
            compte(OwnerModel, False),
            compte(UserModel, True),
            compte(UserModel, False),
        )
        ligne = (await self._session.execute(stmt)).one()
        return PlatformStats(
            active_clinics=int(ligne[0]),
            suspended_clinics=int(ligne[1]),
            active_owners=int(ligne[2]),
            inactive_owners=int(ligne[3]),
            active_staff=int(ligne[4]),
            inactive_staff=int(ligne[5]),
        )


def _vers_staff_row(ligne: Row[Any]) -> StaffRow:
    """Convertit une ligne de la jointure users x clinics en projection.

    Le role est retype en value object au passage : une valeur inattendue en
    base leve ici plutot que de traverser silencieusement jusqu'a l'ecran.
    """
    return StaffRow(
        id=ligne.id,
        clinic_id=ligne.clinic_id,
        clinic_name=ligne.clinic_name,
        clinic_is_active=ligne.clinic_is_active,
        email=ligne.email,
        first_name=ligne.first_name,
        last_name=ligne.last_name,
        role=Role(ligne.role),
        is_active=ligne.is_active,
        created_at=ligne.created_at,
    )


class SqlAlchemyAdminAuditLogRepository:
    """Implemente le port AdminAuditLogRepository : append-only."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def add(self, entry: AdminAuditEntry) -> None:
        self._session.add(
            AdminAuditLogModel(
                id=entry.id,
                occurred_at=entry.occurred_at,
                actor_id=entry.actor_id,
                actor_email=entry.actor_email,
                action=entry.action.value,
                target_type=entry.target_type.value,
                target_id=entry.target_id,
                details=entry.details,
            )
        )

    async def list_for_target(
        self, *, target_type: str, target_id: uuid.UUID, limit: int
    ) -> list[AdminAuditEntry]:
        stmt = (
            select(AdminAuditLogModel)
            .where(
                AdminAuditLogModel.target_type == target_type,
                AdminAuditLogModel.target_id == target_id,
            )
            # Antichronologique : la question posee a un journal est presque
            # toujours "que s'est-il passe recemment ?". L'index
            # ix_admin_audit_log_target sert ce tri directement.
            .order_by(AdminAuditLogModel.occurred_at.desc(), AdminAuditLogModel.id)
            .limit(limit)
        )
        modeles = (await self._session.execute(stmt)).scalars().all()
        return [
            AdminAuditEntry(
                id=modele.id,
                occurred_at=modele.occurred_at,
                actor_id=modele.actor_id,
                actor_email=modele.actor_email,
                action=AuditAction(modele.action),
                target_type=AuditTargetType(modele.target_type),
                target_id=modele.target_id,
                details=modele.details,
            )
            for modele in modeles
        ]
