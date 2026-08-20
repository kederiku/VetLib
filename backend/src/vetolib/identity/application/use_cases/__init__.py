"""Use cases du contexte identity (couche application).

Un use case = un scénario métier complet, orchestré de bout en bout sans
détail technique (ni SQL, ni HTTP). Ce module re-exporte les quatre use
cases pour offrir un point d'import stable à la couche presentation, sans
exposer le découpage interne en modules (un fichier par use case).
"""

from vetolib.identity.application.use_cases.authenticate_user import AuthenticateUser
from vetolib.identity.application.use_cases.get_current_user import GetCurrentUser
from vetolib.identity.application.use_cases.refresh_token import RefreshToken
from vetolib.identity.application.use_cases.register_clinic import RegisterClinic

__all__ = ["AuthenticateUser", "GetCurrentUser", "RefreshToken", "RegisterClinic"]
