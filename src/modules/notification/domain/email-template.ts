import type { DigestView } from "@/modules/digest/domain/types";
import { CATEGORY_LABELS_TR } from "@/shared/category-labels";

export interface DigestEmailContent {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Pure formatter: given a digest, produces the subject/HTML/plain-text for the delivery email. */
export function buildDigestEmail(digest: DigestView): DigestEmailContent {
  const subject = `News Daily — ${digest.date} özeti (${digest.items.length} haber)`;

  const text = digest.items
    .map(
      (item, i) =>
        `${i + 1}. [${CATEGORY_LABELS_TR[item.category]}] ${item.headline}\n\n${item.summary}\n\nNeden önemli: ${item.whyItMatters}`,
    )
    .join("\n\n---\n\n");

  const html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #111;">
<h1 style="font-size: 20px;">News Daily — ${escapeHtml(digest.date)}</h1>
${digest.items
  .map(
    (item) => `<div style="margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid #e5e5e5;">
  <div style="font-size: 12px; color: #666; text-transform: uppercase;">${escapeHtml(CATEGORY_LABELS_TR[item.category])}</div>
  <h2 style="font-size: 16px; margin: 4px 0 8px;">${escapeHtml(item.headline)}</h2>
  <p style="font-size: 14px; line-height: 1.5;">${escapeHtml(item.summary).replace(/\n/g, "<br/><br/>")}</p>
  <p style="font-size: 13px; background: #f5f5f5; padding: 8px 12px; border-radius: 6px;"><strong>Neden önemli:</strong> ${escapeHtml(item.whyItMatters)}</p>
</div>`,
  )
  .join("\n")}
</div>`;

  return { subject, html, text };
}
