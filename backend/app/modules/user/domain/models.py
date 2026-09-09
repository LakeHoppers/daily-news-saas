from dataclasses import dataclass


@dataclass(frozen=True)
class Preference:
    id: str
    user_id: str
    favorite_categories: list[str]
    digest_hour: int
    timezone: str
    paused: bool
    updated_at: str


@dataclass(frozen=True)
class Subscription:
    plan: str
    status: str


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str
    preference: Preference | None
    subscription: Subscription


@dataclass(frozen=True)
class UserIdentity:
    clerk_id: str
    is_admin: bool
    user: CurrentUser
