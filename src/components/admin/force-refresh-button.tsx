"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ForceRefreshButton() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setStatus("running");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/pipeline/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "Bir şeyler ters gitti.");
        return;
      }
      setStatus("done");
      setMessage(
        `Tamamlandı: ${data.fetch.articlesFetched} makale, ${data.cluster.newStories} yeni konu, ${data.summarize.summarized} özet.`,
      );
      router.refresh();
    } catch {
      setStatus("error");
      setMessage("Bir şeyler ters gitti.");
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={run} disabled={status === "running"}>
        {status === "running" ? "Çalışıyor..." : "Şimdi çalıştır"}
      </Button>
      {message && (
        <span className={`text-sm ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
          {message}
        </span>
      )}
    </div>
  );
}
