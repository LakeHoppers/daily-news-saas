from dataclasses import asdict
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic.alias_generators import to_camel

from app.modules.auth.application.ports import AuthUnavailable, InvalidSession
from app.modules.digest.application.latest import GetDigestHistory
from app.modules.user.application.update import UpdatePreferences
from app.modules.user.domain.models import UserIdentity

router = APIRouter()


def wire(value):
    if isinstance(value, dict):
        return {to_camel(k): wire(v) for k, v in value.items()}
    if isinstance(value, list):
        return [wire(v) for v in value]
    return value


def identity(request: Request):
    try:
        subject = request.app.state.verifier.verify(request.headers.get("authorization"))
    except InvalidSession as exc:
        raise HTTPException(401, "Invalid or missing session") from exc
    except AuthUnavailable as exc:
        raise HTTPException(503, "Authentication unavailable") from exc
    user = request.app.state.user_repository.find_by_clerk_id(subject)
    if user is None:
        # Provisioning stays with TS until authoritative-write cutover.
        raise HTTPException(
            409, "User not provisioned; sign in through the current application first"
        )
    return user


CurrentUser = Annotated[UserIdentity, Depends(identity)]


def admin(user: CurrentUser):
    if not user.is_admin:
        raise HTTPException(403, "Not an admin")
    return user


def workspace(request: Request):
    store = request.app.state.workspace
    if store is None:
        raise HTTPException(503, "Writes are disabled during migration")
    return store


@router.get("/api/me")
def me(user: CurrentUser):
    return wire(asdict(user.user))


@router.get("/api/me/digests")
def history(request: Request, user: CurrentUser, limit: int = 14, lang: str = "tr"):
    if limit < 1:
        raise HTTPException(400, "limit must be positive")
    categories = user.user.preference.favorite_categories if user.user.preference else []
    result = GetDigestHistory(request.app.state.digest_repository).execute(
        categories, min(limit, 50), "en" if lang == "en" else "tr"
    )
    return {"digests": wire([asdict(d) for d in result])}


@router.patch("/api/me/preferences")
def preferences(body: dict, request: Request, user: CurrentUser):
    return UpdatePreferences(workspace(request)).execute(user.user.id, body)
