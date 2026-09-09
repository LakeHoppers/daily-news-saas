from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.modules.user.domain.models import CurrentUser, Preference, Subscription, UserIdentity


class SqlAlchemyUserRepository:
    def __init__(self, engine: Engine):
        self.engine = engine

    def find_by_clerk_id(self, clerk_id: str) -> UserIdentity | None:
        # This projection deliberately has no lazy creation/update path.
        with self.engine.connect() as connection, connection.begin():
            connection.execute(text("SET TRANSACTION READ ONLY"))
            user = (
                connection.execute(
                    text(
                        'SELECT id, "clerkId", email, "isAdmin" FROM "User" WHERE "clerkId" = :subject'
                    ),
                    {"subject": clerk_id},
                )
                .mappings()
                .first()
            )
            if user is None:
                return None
            pref = (
                connection.execute(
                    text(
                        'SELECT id, "userId", "favoriteCategories"::text[] AS "favoriteCategories", "digestHour", timezone, paused, '
                        '"updatedAt" FROM "UserPreference" WHERE "userId" = :id'
                    ),
                    {"id": user["id"]},
                )
                .mappings()
                .first()
            )
            subscription = (
                connection.execute(
                    text('SELECT plan, status FROM "Subscription" WHERE "userId" = :id'),
                    {"id": user["id"]},
                )
                .mappings()
                .first()
            )
            return UserIdentity(
                clerk_id=user["clerkId"],
                is_admin=user["isAdmin"],
                user=CurrentUser(
                    id=user["id"],
                    email=user["email"],
                    preference=Preference(
                        id=pref["id"],
                        user_id=pref["userId"],
                        favorite_categories=list(pref["favoriteCategories"]),
                        digest_hour=pref["digestHour"],
                        timezone=pref["timezone"],
                        paused=pref["paused"],
                        updated_at=pref["updatedAt"].isoformat(timespec="milliseconds") + "Z",
                    )
                    if pref
                    else None,
                    subscription=Subscription(subscription["plan"], subscription["status"])
                    if subscription
                    else Subscription("FREE", "ACTIVE"),
                ),
            )
