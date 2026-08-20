"""Use cases du contexte identity (couche application).

Un use case = un scénario métier complet, orchestré de bout en bout sans
détail technique (ni SQL, ni HTTP). Ce module re-exporte les use cases pour
offrir un point d'import stable à la couche presentation, sans exposer le
découpage interne en modules (un fichier par use case).

Trois familles : le STAFF de clinique (B2B — RegisterClinic, AuthenticateUser,
RefreshToken, GetCurrentUser), la FICHE CLINIQUE (GetClinicProfile,
UpdateClinicProfile, et ListPublicClinics pour l'annuaire public) et les
PROPRIÉTAIRES d'animaux (B2C — RegisterOwner, AuthenticateOwner,
RefreshOwnerToken, GetCurrentOwner, UpdateOwnerProfile). Espaces de comptes
et de sessions indépendants.
"""

from vetolib.identity.application.use_cases.authenticate_owner import AuthenticateOwner
from vetolib.identity.application.use_cases.authenticate_user import AuthenticateUser
from vetolib.identity.application.use_cases.get_clinic_profile import GetClinicProfile
from vetolib.identity.application.use_cases.get_current_owner import GetCurrentOwner
from vetolib.identity.application.use_cases.get_current_user import GetCurrentUser
from vetolib.identity.application.use_cases.list_public_clinics import ListPublicClinics
from vetolib.identity.application.use_cases.refresh_owner_token import RefreshOwnerToken
from vetolib.identity.application.use_cases.refresh_token import RefreshToken
from vetolib.identity.application.use_cases.register_clinic import RegisterClinic
from vetolib.identity.application.use_cases.register_owner import RegisterOwner
from vetolib.identity.application.use_cases.update_clinic_profile import UpdateClinicProfile
from vetolib.identity.application.use_cases.update_owner_profile import UpdateOwnerProfile

__all__ = [
    "AuthenticateOwner",
    "AuthenticateUser",
    "GetClinicProfile",
    "GetCurrentOwner",
    "GetCurrentUser",
    "ListPublicClinics",
    "RefreshOwnerToken",
    "RefreshToken",
    "RegisterClinic",
    "RegisterOwner",
    "UpdateClinicProfile",
    "UpdateOwnerProfile",
]
