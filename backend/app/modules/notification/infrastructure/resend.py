import httpx


class ResendSender:
    """Phase 3 transport is restricted to Resend's delivery simulator, never subscribers."""

    def __init__(self, api_key: str, sender="News Daily <onboarding@resend.dev>", client=None):
        self.api_key, self.sender = api_key, sender
        self.client = client or httpx.Client(timeout=15)

    def send(self, recipient, message, idempotency_key):
        if recipient != "delivered@resend.dev":
            raise ValueError("Only the Resend simulator is enabled during migration")
        if not self.api_key:
            raise ValueError("Resend is not configured")
        response = self.client.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {self.api_key}", "Idempotency-Key": idempotency_key},
            json={"from": self.sender, "to": recipient, **message},
        )
        if response.status_code >= 400:
            raise RuntimeError(f"Resend request failed ({response.status_code})")
        return response.json()["id"]

    def close(self):
        self.client.close()
