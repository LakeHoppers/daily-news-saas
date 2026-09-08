import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), currentUser: vi.fn() }));
vi.mock("@/shared/prisma", () => ({ prisma: {} }));
import { requireCronSecret, UnauthorizedError } from "@/shared/api-guards";

const request = (header?: string) => new Request("https://example.com/api/cron/pipeline", {
  headers: header ? { authorization: header } : {},
});
afterEach(() => vi.unstubAllEnvs());
describe("cron authentication", () => {
  it("rejects missing configuration even with Bearer undefined", () => {
    vi.stubEnv("CRON_SECRET", undefined);
    expect(() => requireCronSecret(request("Bearer undefined"))).toThrow(UnauthorizedError);
  });
  it.each(["", "   "])("rejects blank configuration %j", (secret) => {
    vi.stubEnv("CRON_SECRET", secret);
    expect(() => requireCronSecret(request(`Bearer ${secret}`))).toThrow(UnauthorizedError);
  });
  it.each([undefined, "Bearer wrong", "Basic configured-secret"])("rejects invalid header %j", (header) => {
    vi.stubEnv("CRON_SECRET", "configured-secret");
    expect(() => requireCronSecret(request(header))).toThrow(UnauthorizedError);
  });
  it("accepts the configured bearer secret", () => {
    vi.stubEnv("CRON_SECRET", "configured-secret");
    expect(() => requireCronSecret(request("Bearer configured-secret"))).not.toThrow();
  });
});
