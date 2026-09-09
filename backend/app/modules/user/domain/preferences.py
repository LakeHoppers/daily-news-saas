from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

CATEGORIES = {
    "POLITICS",
    "ECONOMY",
    "IMMIGRATION",
    "BERLIN",
    "TECHNOLOGY",
    "EUROPE",
    "BUSINESS",
    "SOCIETY",
    "SPORTS",
}


def preference_patch(body: dict, plan: str) -> dict:
    data = {}
    if isinstance(body.get("favoriteCategories"), list):
        values = [v for v in body["favoriteCategories"] if isinstance(v, str) and v in CATEGORIES]
        data["favoriteCategories"] = values[:1] if plan == "FREE" else values
    hour = body.get("digestHour")
    if type(hour) in (int, float) and 0 <= hour <= 23:
        if not float(hour).is_integer():
            raise ValueError("digestHour must be an integer")
        data["digestHour"] = 9 if plan == "FREE" else int(hour)
    if isinstance(body.get("timezone"), str):
        try:
            ZoneInfo(body["timezone"])
            data["timezone"] = body["timezone"]
        except (ZoneInfoNotFoundError, ValueError):
            pass
    if type(body.get("paused")) is bool:
        data["paused"] = body["paused"]
    return data
