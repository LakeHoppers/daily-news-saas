"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function SummaryEditForm({
  summaryId,
  initial,
}: {
  summaryId: string;
  initial: { headline: string; body: string; whyItMatters: string; tags: string[] };
}) {
  const router = useRouter();
  const [headline, setHeadline] = useState(initial.headline);
  const [body, setBody] = useState(initial.body);
  const [whyItMatters, setWhyItMatters] = useState(initial.whyItMatters);
  const [tags, setTags] = useState(initial.tags.join(", "));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save() {
    setStatus("saving");
    try {
      const res = await fetch(`/api/admin/summaries/${summaryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headline,
          body,
          whyItMatters,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const updated = await res.json();
      setStatus("saved");
      router.replace(`/admin/summaries/${updated.id}`);
      router.refresh();
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="headline">Başlık</Label>
        <Input id="headline" value={headline} onChange={(e) => setHeadline(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="body">Özet</Label>
        <Textarea id="body" rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="why">Neden önemli</Label>
        <Textarea
          id="why"
          rows={3}
          value={whyItMatters}
          onChange={(e) => setWhyItMatters(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="tags">Etiketler (virgülle ayır)</Label>
        <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} />
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={status === "saving"}>
          {status === "saving" ? "Kaydediliyor..." : "Yeni sürüm olarak kaydet"}
        </Button>
        {status === "saved" && (
          <span className="text-sm text-muted-foreground">Kaydedildi — yeni sürüm oluşturuldu.</span>
        )}
        {status === "error" && (
          <span className="text-sm text-destructive">Bir şeyler ters gitti.</span>
        )}
      </div>
    </div>
  );
}
