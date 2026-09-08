import type { DigestView } from "@/modules/digest/domain/types";
import type { Locale } from "@/modules/digest/domain/localize";

/**
 * Server-side migration switch. Unconfigured deployments keep their current
 * path. The Python backend doesn't support `locale` yet (Phase 0-1 only
 * ports the Turkish read path) — it silently ignores the param and always
 * returns Turkish, which is a safe degrade, not a regression, since that
 * path isn't live in production.
 */
export async function getHomeDigest(locale: Locale = "tr"): Promise<DigestView | null> {
  const backend = process.env.PYTHON_BACKEND_URL;
  if (!backend) {
    const { getLatestDigest } = await import("@/modules/digest/infrastructure/digest-view");
    return getLatestDigest([], locale);
  }
  const url = new URL("/api/digests/latest", backend);
  url.searchParams.set("lang", locale);
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Digest backend unavailable");
  return response.json() as Promise<DigestView>;
}
