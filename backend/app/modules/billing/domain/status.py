def map_status(status):
    return {
        "active": "ACTIVE",
        "trialing": "TRIALING",
        "past_due": "PAST_DUE",
        "canceled": "CANCELED",
        "incomplete_expired": "CANCELED",
        "unpaid": "CANCELED",
    }.get(status, "PAST_DUE")


def derive_plan(status):
    return "PRO" if status in ("active", "trialing") else "FREE"
