import { describe, expect, it } from "vitest";
import { derivePlan, mapStripeStatus } from "@/modules/billing/domain/status-mapping";

describe("mapStripeStatus", () => {
  it("maps the common statuses directly", () => {
    expect(mapStripeStatus("active")).toBe("ACTIVE");
    expect(mapStripeStatus("trialing")).toBe("TRIALING");
    expect(mapStripeStatus("past_due")).toBe("PAST_DUE");
  });

  it("maps terminal Stripe statuses to CANCELED", () => {
    expect(mapStripeStatus("canceled")).toBe("CANCELED");
    expect(mapStripeStatus("incomplete_expired")).toBe("CANCELED");
    expect(mapStripeStatus("unpaid")).toBe("CANCELED");
  });

  it("falls back to PAST_DUE for incomplete/paused rather than crashing", () => {
    expect(mapStripeStatus("incomplete")).toBe("PAST_DUE");
    expect(mapStripeStatus("paused")).toBe("PAST_DUE");
    expect(mapStripeStatus("some_future_status_stripe_adds")).toBe("PAST_DUE");
  });
});

describe("derivePlan", () => {
  it("is PRO only for active or trialing", () => {
    expect(derivePlan("active")).toBe("PRO");
    expect(derivePlan("trialing")).toBe("PRO");
  });

  it("is FREE for everything else", () => {
    expect(derivePlan("past_due")).toBe("FREE");
    expect(derivePlan("canceled")).toBe("FREE");
    expect(derivePlan("incomplete")).toBe("FREE");
  });
});
