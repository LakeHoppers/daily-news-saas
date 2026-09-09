import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { isLocale, localeRedirect, switchLocalePath } from "@/shared/locale";

const { protect } = vi.hoisted(() => ({ protect: vi.fn() }));
vi.mock("@clerk/nextjs/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@clerk/nextjs/server")>();
  return { ...actual, clerkMiddleware: (handler: unknown) => handler };
});
import proxy from "@/proxy";

describe("locale routing", () => {
  it.each([
    ["/", "/tr"], ["/?lang=en", "/en"],
    ["/dashboard?lang=en&checkout=success", "/en/dashboard?checkout=success"],
    ["/sign-in/verify?lang=en&redirect_url=%2Fen%2Fdashboard", "/en/sign-in/verify?redirect_url=%2Fen%2Fdashboard"],
    ["/en?lang=tr", "/en"], ["/admin", "/tr/admin"], ["/en/admin/summaries/1", "/tr/admin/summaries/1"],
  ])("canonicalizes %s", (from, to) => {
    const result = localeRedirect(new URL(from, "https://example.com"));
    expect(result?.href).toBe(`https://example.com${to}`);
  });
  it.each(["/en", "/tr/dashboard", "/api/cron/pipeline", "/api/cron/deliver", "/api/webhooks/stripe", "/__clerk/v1", "/favicon.ico", "/_next/static/a.js", "/de"])('does not redirect %s', (path) => {
    expect(localeRedirect(new URL(path, "https://example.com"))).toBeNull();
  });
  it("validates locales and switches the current page", () => {
    expect(isLocale("de")).toBe(false);
    expect(isLocale("en")).toBe(true);
    expect(switchLocalePath("/tr/dashboard", "en")).toBe("/en/dashboard");
  });
  it.each(["tr", "en"])("protects the %s dashboard with a localized auth destination", async (locale) => {
    protect.mockClear();
    const handler = proxy as unknown as (auth: unknown, req: NextRequest) => Promise<unknown>;
    await handler({ protect }, new NextRequest(`https://example.com/${locale}/dashboard`));
    const destination = new URL(protect.mock.calls[0][0].unauthenticatedUrl);
    expect(destination.pathname).toBe(`/${locale}/sign-in`);
    expect(destination.searchParams.get("redirect_url")).toBe(`https://example.com/${locale}/dashboard`);
  });
  it("still protects machine billing routes without a locale redirect", async () => {
    protect.mockClear();
    const handler = proxy as unknown as (auth: unknown, req: NextRequest) => Promise<unknown>;
    await handler({ protect }, new NextRequest("https://example.com/api/billing/checkout"));
    expect(protect).toHaveBeenCalledWith();
  });
});
