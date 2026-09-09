from html import escape

LABELS = {
    "POLITICS": "Politika",
    "ECONOMY": "Ekonomi",
    "IMMIGRATION": "Göç",
    "BERLIN": "Berlin",
    "TECHNOLOGY": "Teknoloji",
    "EUROPE": "Avrupa",
    "BUSINESS": "İş Dünyası",
    "SOCIETY": "Toplum",
    "SPORTS": "Spor",
}


def html_escape(text):
    return escape(text, quote=True).replace("&#x27;", "&#39;")


def build_email(digest):
    items = digest["items"]
    subject = f"News Daily — {digest['date']} özeti ({len(items)} haber)"
    plain = "\n\n---\n\n".join(
        f"{i + 1}. [{LABELS[item['category']]}] {item['headline']}\n\n{item['summary']}\n\nNeden önemli: {item['whyItMatters']}"
        for i, item in enumerate(items)
    )
    blocks = []
    for item in items:
        summary = html_escape(item["summary"]).replace("\n", "<br/><br/>")
        blocks.append(f"""<div style="margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid #e5e5e5;">
  <div style="font-size: 12px; color: #666; text-transform: uppercase;">{html_escape(LABELS[item["category"]])}</div>
  <h2 style="font-size: 16px; margin: 4px 0 8px;">{html_escape(item["headline"])}</h2>
  <p style="font-size: 14px; line-height: 1.5;">{summary}</p>
  <p style="font-size: 13px; background: #f5f5f5; padding: 8px 12px; border-radius: 6px;"><strong>Neden önemli:</strong> {html_escape(item["whyItMatters"])}</p>
</div>""")
    joined = "\n".join(blocks)
    html = f"""<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #111;">
<h1 style="font-size: 20px;">News Daily — {html_escape(digest["date"])}</h1>
{joined}
</div>"""
    return {"subject": subject, "html": html, "text": plain}
