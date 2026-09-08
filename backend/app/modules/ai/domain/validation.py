import math

CATEGORIES = (
    "POLITICS",
    "ECONOMY",
    "IMMIGRATION",
    "BERLIN",
    "TECHNOLOGY",
    "EUROPE",
    "BUSINESS",
    "SOCIETY",
    "SPORTS",
)


def text_fields(value):
    if not isinstance(value, dict) or any(
        not isinstance(value.get(k), str) or not value[k].strip()
        for k in ("headline", "body", "whyItMatters")
    ):
        raise ValueError("Incomplete text output")
    return {k: value[k] for k in ("headline", "body", "whyItMatters")}


def fact_list(value):
    facts = value.get("facts") if isinstance(value, dict) else None
    if not isinstance(facts, list):
        raise TypeError("Missing facts")
    facts = [f for f in facts if isinstance(f, str) and f.strip()]
    if not facts:
        raise ValueError("Empty facts")
    return facts


def summary_output(value, candidate):
    output = text_fields(value)
    output["category"] = (
        value.get("category")
        if value.get("category") in CATEGORIES
        else (candidate if candidate in CATEGORIES else "SOCIETY")
    )
    tags = value.get("tags")
    output["tags"] = [t for t in tags if isinstance(t, str)] if isinstance(tags, list) else []
    return output


def embedding_output(value):
    if (
        not isinstance(value, list)
        or len(value) != 256
        or any(type(n) not in (int, float) or not math.isfinite(n) for n in value)
        or not any(value)
    ):
        raise ValueError("Invalid embedding")
    return value


def js_slice(value, limit):
    """Match JS String.slice's UTF-16 unit budget, including supplementary characters."""
    return value.encode("utf-16-le")[: limit * 2].decode("utf-16-le", errors="replace")
