from typing import Protocol

from app.modules.digest.domain.models import Digest


class DigestRepository(Protocol):
    def latest(self) -> Digest | None: ...


class GetLatestDigest:
    def __init__(self, repository: DigestRepository):
        self.repository = repository

    def execute(self) -> Digest | None:
        return self.repository.latest()
