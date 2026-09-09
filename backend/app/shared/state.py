from collections.abc import Callable
from typing import Protocol, TypeVar

T = TypeVar("T")


class StateStore(Protocol):
    """Isolated state port. No production Postgres writer implements this in Phase 3."""

    def read(self) -> dict: ...
    def transact(self, operation: Callable[[dict], T]) -> T: ...


class ConflictError(Exception):
    pass


class MissingError(Exception):
    pass
