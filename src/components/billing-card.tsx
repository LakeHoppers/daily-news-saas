"use client";

import { useState } from "react";
import { FREE_DIGEST_HOUR, FREE_MAX_CATEGORIES } from "@/modules/billing/domain/plan-limits";

import { SITE_COPY } from "@/shared/site-copy";
import type { Locale } from "@/shared/locale";

export function BillingCard({ plan, locale }: { plan: "FREE" | "PRO"; locale: Locale }) {
  const copy = SITE_COPY[locale];
  const [loading, setLoading] = useState(false);

  async function go(path: "/api/billing/checkout" | "/api/billing/portal") {
    setLoading(true);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{plan === "PRO" ? copy.pro : copy.free}</p>
        <p className="text-xs text-muted-foreground">
          {plan === "PRO"
            ? copy.proDescription
            : locale === "en" ? `${FREE_MAX_CATEGORIES} category and delivery fixed at ${FREE_DIGEST_HOUR}:00 every morning.` : `${FREE_MAX_CATEGORIES} kategori ve sabit sabah ${FREE_DIGEST_HOUR}:00 teslimatı.`}
        </p>
      </div>
      <button
        onClick={() => go(plan === "PRO" ? "/api/billing/portal" : "/api/billing/checkout")}
        disabled={loading}
        className="shrink-0 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-60"
      >
        {loading ? "..." : plan === "PRO" ? copy.manage : copy.upgrade}
      </button>
    </div>
  );
}
