"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { Category } from "@/generated/prisma/enums";
import { CATEGORY_LABELS_TR, CATEGORY_LABELS } from "@/shared/category-labels";

import { SITE_COPY } from "@/shared/site-copy";
import type { Locale } from "@/shared/locale";
import { useRouter } from "next/navigation";

const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS_TR) as Category[];

export function PreferencesForm({
  initialFavoriteCategories,
  plan, locale,
}: {
  initialFavoriteCategories: Category[];
  plan: "FREE" | "PRO";
  locale: Locale;
}) {
  const copy = SITE_COPY[locale];
  const router = useRouter();
  const [selected, setSelected] = useState<Set<Category>>(
    new Set(initialFavoriteCategories),
  );
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  function setChecked(category: Category, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(category);
      else next.delete(category);
      return next;
    });
    setStatus("idle");
  }

  async function save() {
    setStatus("saving");
    try {
      const res = await fetch("/api/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favoriteCategories: [...selected] }),
      });
      setStatus(res.ok ? "saved" : "error");
      if (res.ok) router.refresh();
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        {copy.preferences} {plan === "FREE" && copy.freeLimit}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ALL_CATEGORIES.map((category) => (
          <div
            key={category}
            className="flex items-center gap-2 text-sm"
          >
            <Checkbox
              id={`category-${category}`}
              checked={selected.has(category)}
              onCheckedChange={(checked) => setChecked(category, checked === true)}
            />
            <Label htmlFor={`category-${category}`} className="font-normal">
              {CATEGORY_LABELS[locale][category]}
            </Label>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={status === "saving"}
          className="w-fit rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-60"
        >
          {status === "saving" ? copy.saving : copy.save}
        </button>
        {status === "saved" && (
          <span className="text-sm text-muted-foreground">
            {copy.saved}
          </span>
        )}
        {status === "error" && (
          <span className="text-sm text-destructive">{copy.error}</span>
        )}
      </div>
    </div>
  );
}
