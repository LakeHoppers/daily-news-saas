from datetime import UTC, datetime
from typing import Protocol
from uuid import uuid4

from app.modules.billing.domain.status import derive_plan, map_status
from app.shared.state import StateStore


class StripeGateway(Protocol):
    def create_customer(self, email: str, user_id: str) -> str: ...
    def checkout(
        self, customer_id: str, price_id: str, success_url: str, cancel_url: str
    ) -> str: ...
    def portal(self, customer_id: str, return_url: str) -> str: ...


class BillingService:
    def __init__(self, store: StateStore, gateway: StripeGateway, origin: str, price_id: str):
        self.store, self.gateway, self.origin, self.price_id = (
            store,
            gateway,
            origin.rstrip("/"),
            price_id,
        )

    def checkout(self, user_id, email, locale="tr", price_id=None):
        if locale not in ("tr", "en"):
            locale = "tr"
        price_id = price_id or self.price_id
        if not price_id:
            raise ValueError("priceId is required")

        def ensure_customer(data):
            rows = data.setdefault("subscriptions", [])
            sub = next((s for s in rows if s["userId"] == user_id), None)
            if sub is None:
                sub = {"id": str(uuid4()), "userId": user_id, "plan": "FREE", "status": "ACTIVE"}
                rows.append(sub)
            if not sub.get("stripeCustomerId"):
                sub["stripeCustomerId"] = self.gateway.create_customer(email, user_id)
            return sub["stripeCustomerId"]

        customer = self.store.transact(ensure_customer)
        return self.gateway.checkout(
            customer,
            price_id,
            f"{self.origin}/{locale}/dashboard?checkout=success",
            f"{self.origin}/{locale}/dashboard?checkout=cancelled",
        )

    def portal(self, user_id, locale="tr"):
        if locale not in ("tr", "en"):
            locale = "tr"
        sub = next(
            (s for s in self.store.read().get("subscriptions", []) if s["userId"] == user_id), {}
        )
        if not sub.get("stripeCustomerId"):
            raise ValueError("This user has no Stripe customer yet")
        return self.gateway.portal(sub["stripeCustomerId"], f"{self.origin}/{locale}/dashboard")

    def sync(self, event):
        if event["type"] not in (
            "customer.subscription.created",
            "customer.subscription.updated",
            "customer.subscription.deleted",
        ):
            return {"received": True, "handled": False}
        subscription = event["data"]["object"]
        customer = subscription["customer"]
        customer = customer if isinstance(customer, str) else customer["id"]
        items = subscription.get("items", {}).get("data", [])
        end = items[0].get("current_period_end") if items else None

        def update(data):
            sub = next(
                (s for s in data.get("subscriptions", []) if s.get("stripeCustomerId") == customer),
                None,
            )
            if sub is None:
                return {"received": True, "handled": True, "synced": False}
            # Retries do not append rows; signature verification happens before this call.
            sub.update(
                stripeSubscriptionId=subscription["id"],
                plan=derive_plan(subscription["status"]),
                status=map_status(subscription["status"]),
                currentPeriodEnd=datetime.fromtimestamp(end, UTC)
                .isoformat(timespec="milliseconds")
                .replace("+00:00", "Z")
                if end
                else None,
            )
            return {"received": True, "handled": True, "synced": True}

        return self.store.transact(update)
