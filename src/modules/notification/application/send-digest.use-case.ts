import { isDueNow } from "../domain/due-check";
import { buildDigestEmail } from "../domain/email-template";
import type { DigestReader, EmailSender, NotificationRepository } from "./ports";

export interface SendDigestResult {
  delivered: number;
  failed: number;
  skipped: number;
}

export class SendDigestUseCase {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly digestReader: DigestReader,
    private readonly emailSender: EmailSender,
  ) {}

  async execute(now: Date = new Date()): Promise<SendDigestResult> {
    const candidates = await this.repository.getEmailDeliveryCandidates();
    const due = candidates.filter((candidate) =>
      isDueNow(candidate.timezone, candidate.digestHour, now),
    );

    let delivered = 0;
    let failed = 0;
    let skipped = 0;

    for (const candidate of due) {
      const digest = await this.digestReader.getLatestDigest(candidate.favoriteCategories);
      if (!digest || digest.items.length === 0) {
        skipped++;
        continue;
      }

      if (await this.repository.hasDelivery(digest.digestId, candidate.userId)) {
        skipped++;
        continue;
      }

      try {
        const { subject, html, text } = buildDigestEmail(digest);
        await this.emailSender.send({ to: candidate.email, subject, html, text });
        await this.repository.recordDelivery({
          digestId: digest.digestId,
          userId: candidate.userId,
          status: "sent",
        });
        delivered++;
      } catch (err) {
        await this.repository.recordDelivery({
          digestId: digest.digestId,
          userId: candidate.userId,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
        failed++;
      }
    }

    return { delivered, failed, skipped };
  }
}
