"""Invariant partage : un email = un identifiant de connexion staff unique.

Extrait de RegisterClinic pour etre reutilise par les creations du
back-office. La regle etait deja la, ecrite une fois ; elle est maintenant
ecrite une fois ET partagee, ce qui est different.

Nom de module prefixe d'un underscore : ce n'est pas un use case, c'est un
detail d'implementation commun a plusieurs d'entre eux. Le prefixe le dit, et
le module n'est pas re-exporte par le paquet.
"""

from vetolib.identity.application.ports import IdentityUnitOfWork
from vetolib.identity.domain.errors import EmailAlreadyExistsError
from vetolib.identity.domain.value_objects import Email


async def ensure_email_available(uow: IdentityUnitOfWork, email: Email) -> None:
    """Verifie que l'email est libre cote users ET cote clinics.

    Les deux tables sont interrogees parce que l'inscription publique cree un
    utilisateur ET une clinique avec la meme adresse : laisser passer un
    doublon d'un cote produirait une erreur d'integrite du cote de l'autre,
    au commit, avec un message beaucoup moins clair.

    Ce SELECT ne protege PAS d'une course entre deux requetes concurrentes.
    L'arbitre final reste l'index unique partiel, dont la violation est
    traduite en EmailAlreadyExistsError au commit (voir infrastructure/uow.py).
    Le role de cette fonction est de produire un message propre AU PLUS TOT,
    avant d'avoir hache un mot de passe pour rien.
    """
    if await uow.users.get_by_email(email) is not None or await uow.clinics.exists_with_email(
        email
    ):
        raise EmailAlreadyExistsError(f"L'adresse {email.value} est déjà utilisée.")
