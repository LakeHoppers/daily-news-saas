"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORY_LABELS_TR } from "@/shared/category-labels";
import type { Category } from "@/generated/prisma/enums";

const CATEGORIES = Object.keys(CATEGORY_LABELS_TR) as Category[];

export function AddSourceForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<Category | "">("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);
    try {
      const res = await fetch("/api/admin/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url, type: "RSS", category: category || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Bir şeyler ters gitti.");
        setStatus("error");
        return;
      }
      setName("");
      setUrl("");
      setCategory("");
      setStatus("idle");
      router.refresh();
    } catch {
      setError("Bir şeyler ters gitti.");
      setStatus("error");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-col gap-1">
        <Label htmlFor="source-name">Ad</Label>
        <Input
          id="source-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Örn. Der Spiegel"
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="source-url">RSS URL</Label>
        <Input
          id="source-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="source-category">Kategori</Label>
        <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
          <SelectTrigger id="source-category" className="w-40">
            <SelectValue placeholder="Seç" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_LABELS_TR[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={status === "saving"}>
        {status === "saving" ? "Ekleniyor..." : "Kaynak ekle"}
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </form>
  );
}
