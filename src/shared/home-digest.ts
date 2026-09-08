import type { DigestView } from "@/modules/digest/domain/types";

/** Server-side migration switch. Unconfigured deployments keep their current path. */
export async function getHomeDigest(): Promise<DigestView | null> {
  const backend = process.env.PYTHON_BACKEND_URL;
  if (!backend) {
    const { getLatestDigest } = await import("@/modules/digest/infrastructure/digest-view");
    return getLatestDigest();
  }
  const response = await fetch(new URL("/api/digests/latest", backend), {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Digest backend unavailable");
  return response.json() as Promise<DigestView>;
}
