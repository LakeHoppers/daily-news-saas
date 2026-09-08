"""RSS 2.0 / RDF / Atom normalization matching the installed TS rss-parser path."""

import html
import re
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree as ET

from app.modules.scraper.domain.models import Article

MAX_BYTES = 5_000_000


def snippet(value: str) -> str:
    value = re.sub(
        r"([^\n])</?(h|br|p|ul|ol|li|blockquote|section|table|tr|div)(?:.|\n)*?>([^\n])",
        r"\1\n\3",
        value,
    )
    return html.unescape(re.sub(r"<(?:.|\n)*?>", "", value)).strip()


def date_value(value: str | None) -> str | None:
    if not value:
        return None
    try:
        try:
            date = datetime.fromisoformat(value.strip())
        except ValueError:
            date = parsedate_to_datetime(value)
        if date.tzinfo is None:
            date = date.replace(tzinfo=UTC)
        return date.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    except (ValueError, TypeError, OverflowError):
        # Unlike JS Invalid Date objects, invalid dates are explicitly unknown.
        return None


def parse_feed(xml: bytes, feed_url: str) -> list[Article]:
    if len(xml) > MAX_BYTES or b"<!DOCTYPE" in xml.upper() or b"<!ENTITY" in xml.upper():
        raise ValueError("Oversized feed or prohibited XML declaration")
    root = ET.fromstring(xml)
    kind = root.tag.split("}")[-1]
    if kind not in {"rss", "RDF", "feed"}:
        raise ValueError("Unsupported feed root")
    atom = kind == "feed"
    entries = root.findall("{*}entry") if atom else root.findall(".//{*}item")
    result = []
    for entry in entries:

        def value(name, entry=entry):
            element = entry.find("{*}" + name)
            if element is None:
                return None
            if len(element):
                return "".join(element.itertext())
            return element.text or ""

        title = value("title")
        link = value("link")
        if atom:
            links = entry.findall("{*}link")
            alternate = next((x for x in links if x.get("rel") == "alternate"), None)
            chosen = alternate if alternate is not None else (links[0] if links else None)
            link = chosen.get("href") if chosen is not None else None
        content = value("content" if atom else "description")
        body = snippet(content) if content is not None else (value("summary") or "")
        # TS uses guid, not Atom id. Keep this identity convention during coexistence.
        guid = value("guid") if not atom else None
        external = next((x for x in [guid, link, title, feed_url] if x is not None), feed_url)
        published = (
            (value("published") or value("updated"))
            if atom
            else (value("pubDate") or value("date"))
        )
        result.append(
            Article(
                external,
                link if link is not None else feed_url,
                title if title is not None else "(untitled)",
                body,
                date_value(published),
            )
        )
    return result
