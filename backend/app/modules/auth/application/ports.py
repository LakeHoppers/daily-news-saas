from typing import Protocol


class InvalidSession(Exception):
    pass


class AuthUnavailable(Exception):
    pass


class AuthVerifier(Protocol):
    def verify(self, authorization: str | None) -> str: ...
