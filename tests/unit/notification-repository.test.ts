import { afterEach, expect, it, vi } from "vitest";
const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/shared/prisma", () => ({ prisma: { digestDelivery: { findUnique } } }));
import { PrismaNotificationRepository } from "@/modules/notification/infrastructure/prisma-notification-repository";
afterEach(() => vi.clearAllMocks());
it.each([null, { status: "failed" }, { status: "pending" }])("does not treat %j as a received digest", async (row) => {
  findUnique.mockResolvedValue(row);
  expect(await new PrismaNotificationRepository().hasDelivery("digest", "user")).toBe(false);
});
it("suppresses an already sent digest for the same recipient and channel", async () => {
  findUnique.mockResolvedValue({ status: "sent" });
  expect(await new PrismaNotificationRepository().hasDelivery("digest", "user")).toBe(true);
  expect(findUnique).toHaveBeenCalledWith({ where: { digestId_userId_channel: { digestId: "digest", userId: "user", channel: "EMAIL" } } });
});
