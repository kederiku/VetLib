"""Use cases du back-office plateforme (espace des super-admins).

Sous-paquet dedie plutot que des fichiers noyes parmi ceux des deux autres
espaces : le back-office compte une quinzaine de use cases, et les regrouper
rend visible d'un coup d'oeil ce qui appartient a l'espace le plus
privilegie du produit -- c'est aussi ce qu'un relecteur veut pouvoir isoler.

Volontairement NON re-exporte par use_cases/__init__.py : les imports
explicites (`from ...use_cases.admin import ListAdminClinics`) disent d'ou
vient le code, et evitent qu'un use case admin se retrouve importe par
inadvertance depuis un flux staff ou proprietaire.

Organisation interne : les LECTURES sont regroupees dans directory.py (elles
ne font que deleguer et projeter), les ECRITURES sont reparties par agregat
(clinics, owners, staff) car chacune porte des regles qui meritent leur
propre explication.
"""

from vetolib.identity.application.use_cases.admin.authenticate_admin import AuthenticateAdmin
from vetolib.identity.application.use_cases.admin.clinics import (
    CreateAdminClinic,
    GetAdminClinic,
    SetAdminClinicStatus,
    UpdateAdminClinic,
)
from vetolib.identity.application.use_cases.admin.directory import (
    GetPlatformStats,
    ListAdminClinics,
    ListAdminOwners,
    ListAdminStaff,
)
from vetolib.identity.application.use_cases.admin.get_current_admin import GetCurrentAdmin
from vetolib.identity.application.use_cases.admin.owners import (
    GetAdminOwner,
    SetAdminOwnerStatus,
    UpdateAdminOwner,
)
from vetolib.identity.application.use_cases.admin.refresh_admin_token import RefreshAdminToken
from vetolib.identity.application.use_cases.admin.staff import (
    ChangeAdminStaffRole,
    CreateAdminStaff,
    SetAdminStaffStatus,
)

__all__ = [
    "AuthenticateAdmin",
    "ChangeAdminStaffRole",
    "CreateAdminClinic",
    "CreateAdminStaff",
    "GetAdminClinic",
    "GetAdminOwner",
    "GetCurrentAdmin",
    "GetPlatformStats",
    "ListAdminClinics",
    "ListAdminOwners",
    "ListAdminStaff",
    "RefreshAdminToken",
    "SetAdminClinicStatus",
    "SetAdminOwnerStatus",
    "SetAdminStaffStatus",
    "UpdateAdminClinic",
    "UpdateAdminOwner",
]
