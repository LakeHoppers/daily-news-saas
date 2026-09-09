import { beforeEach, expect, it, vi } from "vitest";
const { checkout, portal } = vi.hoisted(() => ({ checkout: vi.fn(), portal: vi.fn() }));
vi.mock("@/shared/api-guards", () => ({ getOrCreateCurrentUser: async () => ({ id: "user", email: "test@example.com" }), UnauthorizedError: class extends Error {} }));
vi.mock("@/modules/billing/infrastructure/prisma-billing-repository", () => ({ PrismaBillingRepository: class {} }));
vi.mock("@/modules/billing/infrastructure/stripe-gateway", () => ({ RealStripeGateway: class {} }));
vi.mock("@/modules/billing/application/create-checkout-session.use-case", () => ({ CreateCheckoutSessionUseCase: class { execute = checkout; } }));
vi.mock("@/modules/billing/application/create-portal-session.use-case", () => ({ CreatePortalSessionUseCase: class { execute = portal; }, NoStripeCustomerError: class extends Error {} }));
import { POST as createCheckout } from "@/app/api/billing/checkout/route";
import { POST as createPortal } from "@/app/api/billing/portal/route";
beforeEach(() => { checkout.mockReset().mockResolvedValue("https://checkout.stripe.com/test"); portal.mockReset().mockResolvedValue("https://billing.stripe.com/test"); });
it.each(["tr", "en"])("returns to the %s account after checkout and portal", async (locale) => {
  const request = () => new Request("https://example.com/api/billing/checkout", { method: "POST", body: JSON.stringify({ locale, priceId: "test" }) });
  expect((await createCheckout(request())).status).toBe(200);
  expect(checkout.mock.calls[0][0]).toMatchObject({ successUrl: `https://example.com/${locale}/dashboard?checkout=success`, cancelUrl: `https://example.com/${locale}/dashboard?checkout=cancelled` });
  await createPortal(request());
  expect(portal.mock.calls[0][0].returnUrl).toBe(`https://example.com/${locale}/dashboard`);
});
it("cannot turn an untrusted locale into a return URL", async () => {
  await createPortal(new Request("https://example.com/api/billing/portal", { method: "POST", body: JSON.stringify({ locale: "https://attacker.example" }) }));
  expect(portal.mock.calls[0][0].returnUrl).toBe("https://example.com/tr/dashboard");
});
