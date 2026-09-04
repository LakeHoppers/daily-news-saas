import type { Category } from "@/generated/prisma/enums";
import type { DigestView } from "@/modules/digest/domain/types";

export interface DeliveryCandidate {
  userId: string;
  email: string;
  timezone: string;
  digestHour: number;
  favoriteCategories: Category[];
}

export interface DigestReader {
  getLatestDigest(categories: Category[]): Promise<DigestView | null>;
}

export interface EmailSender {
  send(input: { to: string; subject: string; html: string; text: string }): Promise<void>;
}

export type DeliveryStatus = "sent" | "failed";

export interface NotificationRepository {
  /** Not paused, has preferences set — every user is a candidate; timezone/hour filtering happens in the use case. */
  getEmailDeliveryCandidates(): Promise<DeliveryCandidate[]>;
  hasDelivery(digestId: string, userId: string): Promise<boolean>;
  recordDelivery(input: {
    digestId: string;
    userId: string;
    status: DeliveryStatus;
    error?: string;
  }): Promise<void>;
}
