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
        self._hasher = PasswordHash.recommended()
        self._dummy = self._hasher.hash("vetolib-dummy-password")

    async def hash(self, plain: str) -> str:
        return await anyio.to_thread.run_sync(self._hasher.hash, plain)

    async def verify_and_update(self, plain: str, hashed: str) -> tuple[bool, str | None]:
        return await anyio.to_thread.run_sync(self._hasher.verify_and_update, plain, hashed)

    def dummy_hash(self) -> str:
        return self._dummy
