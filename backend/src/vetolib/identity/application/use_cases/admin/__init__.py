"""Use cases du back-office plateforme (espace des super-admins).

Sous-paquet dedie plutot que des fichiers noyes parmi ceux des deux autres
espaces : le back-office aura une quinzaine de use cases, et les regrouper
rend visible d'un coup d'oeil ce qui appartient a l'espace le plus
privilegie du produit -- c'est aussi ce qu'un relecteur veut pouvoir isoler.

Volontairement NON re-exporte par use_cases/__init__.py : les imports
explicites (`from ...use_cases.admin import AuthenticateAdmin`) disent d'ou
vient le code, et evitent qu'un use case admin se retrouve importe par
inadvertance depuis un flux staff ou proprietaire.
"""

from vetolib.identity.application.use_cases.admin.authenticate_admin import AuthenticateAdmin
from vetolib.identity.application.use_cases.admin.get_current_admin import GetCurrentAdmin
from vetolib.identity.application.use_cases.admin.refresh_admin_token import RefreshAdminToken

__all__ = ["AuthenticateAdmin", "GetCurrentAdmin", "RefreshAdminToken"]
