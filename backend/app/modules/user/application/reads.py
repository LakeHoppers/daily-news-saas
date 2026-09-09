from typing import Protocol

from app.modules.digest.application.latest import DigestRepository, GetDigestHistory, Locale
from app.modules.user.domain.models import UserIdentity


class UserRepository(Protocol):
    def find_by_clerk_id(self, clerk_id: str) -> UserIdentity | None: ...


class ReadExistingUser:
    """Internal only in 3a. A verified auth subject is required before HTTP exposure."""

    def __init__(self, repository: UserRepository):
        self.repository = repository

    def execute(self, clerk_id: str) -> UserIdentity | None:
        if not clerk_id:
            raise ValueError("subject is required")
        return self.repository.find_by_clerk_id(clerk_id)


class ReadUserHistory:
    def __init__(self, users: UserRepository, digests: DigestRepository):
        self.users = ReadExistingUser(users)
        self.digests = GetDigestHistory(digests)

    def execute(self, clerk_id: str, limit: int = 14, locale: Locale = "tr"):
        identity = self.users.execute(clerk_id)
        if identity is None:
            raise LookupError("User not provisioned")
        preference = identity.user.preference
        return self.digests.execute(
            preference.favorite_categories if preference else [], limit, locale
        )
