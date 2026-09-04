import { prisma } from "@/shared/prisma";
import type {
  DeliveryCandidate,
  DeliveryStatus,
  NotificationRepository,
} from "../application/ports";

export class PrismaNotificationRepository implements NotificationRepository {
  async getEmailDeliveryCandidates(): Promise<DeliveryCandidate[]> {
    const users = await prisma.user.findMany({
      where: { preference: { paused: false } },
      include: { preference: true },
    });

    return users
      .filter((user) => user.preference !== null)
      .map((user) => ({
        userId: user.id,
        email: user.email,
        timezone: user.preference!.timezone,
        digestHour: user.preference!.digestHour,
        favoriteCategories: user.preference!.favoriteCategories,
      }));
  }

  async hasDelivery(digestId: string, userId: string): Promise<boolean> {
    const existing = await prisma.digestDelivery.findUnique({
      where: { digestId_userId_channel: { digestId, userId, channel: "EMAIL" } },
    });
    return existing !== null;
  }

  async recordDelivery(input: {
    digestId: string;
    userId: string;
    status: DeliveryStatus;
    error?: string;
  }): Promise<void> {
    await prisma.digestDelivery.upsert({
      where: {
        digestId_userId_channel: {
          digestId: input.digestId,
          userId: input.userId,
          channel: "EMAIL",
        },
      },
      create: {
        digestId: input.digestId,
        userId: input.userId,
        channel: "EMAIL",
        status: input.status,
        error: input.error,
        sentAt: input.status === "sent" ? new Date() : null,
      },
      update: {
        status: input.status,
        error: input.error,
        sentAt: input.status === "sent" ? new Date() : null,
      },
    });
  }
}
