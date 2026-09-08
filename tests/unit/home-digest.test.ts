import { afterEach, expect, it, vi } from "vitest";
const { legacy } = vi.hoisted(() => ({ legacy: vi.fn().mockResolvedValue(null) }));
vi.mock("@/modules/digest/infrastructure/digest-view", () => ({ getLatestDigest: legacy }));
import { getHomeDigest } from "@/shared/home-digest";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
it("uses HTTP when Python is enabled", async () => {
  vi.stubEnv("PYTHON_BACKEND_URL", "http://127.0.0.1:8000");
  const digest = { digestId: "d", date: "2026-09-07", items: [] };
  const fetcher = vi.fn().mockResolvedValue(Response.json(digest));
  vi.stubGlobal("fetch", fetcher);
  expect(await getHomeDigest()).toEqual(digest);
  expect(String(fetcher.mock.calls[0][0])).toBe("http://127.0.0.1:8000/api/digests/latest");
  expect(fetcher.mock.calls[0][1].cache).toBe("no-store");
  expect(legacy).not.toHaveBeenCalled();
});
it("keeps unconfigured deployments working", async () => {
  vi.stubEnv("PYTHON_BACKEND_URL", undefined);
  await getHomeDigest();
  expect(legacy).toHaveBeenCalledOnce();
});
it("maps Python's missing digest to the empty homepage", async () => {
  vi.stubEnv("PYTHON_BACKEND_URL", "http://localhost:8000");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
  expect(await getHomeDigest()).toBeNull();
});
it("does not silently mask a backend failure with Prisma", async () => {
  vi.stubEnv("PYTHON_BACKEND_URL", "http://localhost:8000");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
  await expect(getHomeDigest()).rejects.toThrow("Digest backend unavailable");
  expect(legacy).not.toHaveBeenCalled();
});
