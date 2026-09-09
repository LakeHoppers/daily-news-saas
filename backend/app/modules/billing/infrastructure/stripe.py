import stripe


class TestStripeGateway:
    """Real Stripe SDK, deliberately test-key-only until Phase 4 cutover."""

    __test__ = False

    def __init__(self, api_key):
        if not api_key.startswith("sk_test_"):
            raise ValueError("Only Stripe test-mode keys are permitted during migration")
        self.client = stripe.StripeClient(api_key, max_network_retries=1)

    def create_customer(self, email, user_id):
        return self.client.v1.customers.create(
            {"email": email, "metadata": {"userId": user_id}},
            options={"idempotency_key": f"python-migration-customer:{user_id}"},
        ).id

    def checkout(self, customer_id, price_id, success_url, cancel_url):
        session = self.client.v1.checkout.sessions.create(
            {
                "customer": customer_id,
                "mode": "subscription",
                "line_items": [{"price": price_id, "quantity": 1}],
                "success_url": success_url,
                "cancel_url": cancel_url,
            }
        )
        if not session.url:
            raise RuntimeError("Stripe did not return a checkout URL")
        return session.url

    def portal(self, customer_id, return_url):
        return self.client.v1.billing_portal.sessions.create(
            {"customer": customer_id, "return_url": return_url}
        ).url


def verify_webhook(raw_body: bytes, signature: str, secret: str):
    if not signature or not secret:
        raise ValueError("Missing webhook signature")
    return stripe.Webhook.construct_event(raw_body, signature, secret, tolerance=300).to_dict()
