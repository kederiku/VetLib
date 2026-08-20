from pwdlib import PasswordHash


class PwdlibPasswordHasher:
    """Argon2id via pwdlib (successeur maintenu de passlib).

    À instancier une seule fois (singleton DI) : le hash factice est
    pré-calculé à la construction — coût Argon2 payé une fois, pas par requête.
    """

    def __init__(self) -> None:
        self._hasher = PasswordHash.recommended()
        self._dummy = self._hasher.hash("vetolib-dummy-password")

    def hash(self, plain: str) -> str:
        return self._hasher.hash(plain)

    def verify_and_update(self, plain: str, hashed: str) -> tuple[bool, str | None]:
        return self._hasher.verify_and_update(plain, hashed)

    def dummy_hash(self) -> str:
        return self._dummy
