"use client";

import { useState } from "react";
import { FREE_DIGEST_HOUR, FREE_MAX_CATEGORIES } from "@/modules/billing/domain/plan-limits";

export function BillingCard({ plan }: { plan: "FREE" | "PRO" }) {
  const [loading, setLoading] = useState(false);

  async function go(path: "/api/billing/checkout" | "/api/billing/portal") {
    setLoading(true);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
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
        <p className="text-sm font-medium">{plan === "PRO" ? "Pro üye" : "Ücretsiz plan"}</p>
        <p className="text-xs text-muted-foreground">
          {plan === "PRO"
            ? "Tüm kategoriler ve istediğin saatte teslimat açık."
            : `Ücretsiz planda ${FREE_MAX_CATEGORIES} kategori ve sabit ${FREE_DIGEST_HOUR}:00 teslimat saati var.`}
        </p>
      </div>
      <button
        onClick={() => go(plan === "PRO" ? "/api/billing/portal" : "/api/billing/checkout")}
        disabled={loading}
        className="shrink-0 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-60"
      >
        {loading ? "..." : plan === "PRO" ? "Faturalandırmayı yönet" : "Pro'ya yükselt"}
      </button>
    </div>
  );
}
