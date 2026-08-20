"""Adapter de hachage de mots de passe : implémente le port PasswordHasher.

Pourquoi hacher ? On ne stocke JAMAIS un mot de passe en clair : en cas de
fuite de la base, l'attaquant ne doit récupérer que des empreintes
irréversibles. Un hash cryptographique classique (SHA-256...) ne suffit
pas : trop rapide, il se brute-force par milliards d'essais/seconde.

Pourquoi Argon2id ? C'est le vainqueur de la Password Hashing Competition
(2015), recommandé par l'OWASP : volontairement LENT et gourmand en
MÉMOIRE, ce qui neutralise les attaques massives sur GPU/ASIC. Le hash
produit embarque sel + paramètres de coût ("$argon2id$v=19$m=...,t=,p=$..."),
donc deux utilisateurs avec le même mot de passe ont des hashs différents.

La couche application ne voit que le port PasswordHasher (Protocol) : on
peut brancher un faux hasher instantané dans les tests unitaires.
"""

import anyio.to_thread
from pwdlib import PasswordHash


class PwdlibPasswordHasher:
    """Argon2id via pwdlib (successeur maintenu de passlib).

    À instancier une seule fois (singleton DI) : le hash factice est
    pré-calculé à la construction — coût Argon2 payé une fois, pas par requête.
    Les opérations par requête partent dans le threadpool (argon2-cffi relâche
    le GIL) pour ne jamais bloquer l'event loop.
    """

    def __init__(self) -> None:
        # `recommended()` = Argon2id avec les paramètres à jour de pwdlib ;
        # pas de réglage maison, on suit les recommandations de la lib.
        self._hasher = PasswordHash.recommended()
        self._dummy = self._hasher.hash("vetolib-dummy-password")

    async def hash(self, plain: str) -> str:
        """Calcule l'empreinte Argon2 hors event loop (~ dizaines de ms CPU)."""
        return await anyio.to_thread.run_sync(self._hasher.hash, plain)

    async def verify_and_update(self, plain: str, hashed: str) -> tuple[bool, str | None]:
        """Vérifie et retourne (valide ?, nouveau hash ou None).

        Le second élément n'est pas None quand le hash stocké utilise des
        paramètres devenus obsolètes : le use case de login persiste alors
        ce nouveau hash, ce qui migre le parc au fil des connexions sans
        jamais redemander le mot de passe.
        """
        return await anyio.to_thread.run_sync(self._hasher.verify_and_update, plain, hashed)

    def dummy_hash(self) -> str:
        """Hash factice pour les emails inconnus au login.

        Sans lui, un login sur email inexistant répondrait beaucoup plus
        vite (pas de calcul Argon2) qu'un login sur email existant : un
        attaquant pourrait déduire quels emails ont un compte (oracle
        temporel). On vérifie donc TOUJOURS un hash, même pour rien.
        """
        return self._dummy
