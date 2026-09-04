import { describe, expect, it } from "vitest";
import { SendDigestUseCase } from "@/modules/notification/application/send-digest.use-case";
import type {
  DeliveryCandidate,
  DeliveryStatus,
  DigestReader,
  EmailSender,
  NotificationRepository,
} from "@/modules/notification/application/ports";
import type { DigestView } from "@/modules/digest/domain/types";

class FakeRepository implements NotificationRepository {
  candidates: DeliveryCandidate[] = [];
  delivered = new Set<string>();
  recorded: { digestId: string; userId: string; status: DeliveryStatus; error?: string }[] = [];

  async getEmailDeliveryCandidates() {
    return this.candidates;
  }
  async hasDelivery(digestId: string, userId: string) {
    return this.delivered.has(`${digestId}:${userId}`);
  }
  async recordDelivery(input: {
    digestId: string;
    userId: string;
    status: DeliveryStatus;
    error?: string;
  }) {
    this.recorded.push(input);
    if (input.status === "sent") this.delivered.add(`${input.digestId}:${input.userId}`);
  }
}

class FakeDigestReader implements DigestReader {
  constructor(private readonly digest: DigestView | null) {}
  async getLatestDigest() {
    return this.digest;
  }
}

class FakeEmailSender implements EmailSender {
  sentTo: string[] = [];
  constructor(private readonly failFor: Set<string> = new Set()) {}
  async send(input: { to: string }) {
    if (this.failFor.has(input.to)) throw new Error("send failed");
    this.sentTo.push(input.to);
  }
}

function candidate(overrides: Partial<DeliveryCandidate> = {}): DeliveryCandidate {
  return {
    userId: "user-1",
    email: "user1@example.de",
    timezone: "Europe/Berlin",
    digestHour: 13, // matches NOW below (12:00 UTC = 13:00 CET)
    favoriteCategories: [],
    ...overrides,
  };
}

const NOW = new Date("2026-01-15T12:00:00.000Z");

const DIGEST: DigestView = {
  digestId: "digest-1",
  date: "2026-01-15",
  items: [
    {
      rank: 1,
      storyId: "s1",
      category: "POLITICS",
      headline: "H",
      summary: "S",
      whyItMatters: "W",
      tags: [],
      sourceUrls: [],
    },
  ],
};

describe("SendDigestUseCase", () => {
  it("delivers to due candidates and records a sent delivery", async () => {
    const repository = new FakeRepository();
    repository.candidates = [candidate()];
    const emailSender = new FakeEmailSender();

    const result = await new SendDigestUseCase(
      repository,
      new FakeDigestReader(DIGEST),
      emailSender,
    ).execute(NOW);

    expect(result).toEqual({ delivered: 1, failed: 0, skipped: 0 });
    expect(emailSender.sentTo).toEqual(["user1@example.de"]);
    expect(repository.recorded).toEqual([
      { digestId: "digest-1", userId: "user-1", status: "sent" },
    ]);
  });

  it("skips candidates whose local hour doesn't match their digestHour", async () => {
    const repository = new FakeRepository();
    repository.candidates = [candidate({ digestHour: 7 })]; // not due at NOW in Berlin
    const emailSender = new FakeEmailSender();

    const result = await new SendDigestUseCase(
      repository,
      new FakeDigestReader(DIGEST),
      emailSender,
    ).execute(NOW);

    expect(result).toEqual({ delivered: 0, failed: 0, skipped: 0 });
    expect(emailSender.sentTo).toEqual([]);
  });

  it("skips when there is no digest yet or it has no items", async () => {
    const repository = new FakeRepository();
    repository.candidates = [candidate()];

    const result = await new SendDigestUseCase(
      repository,
      new FakeDigestReader(null),
      new FakeEmailSender(),
    ).execute(NOW);

    expect(result).toEqual({ delivered: 0, failed: 0, skipped: 1 });
  });

  it("skips a candidate already delivered to for this digest", async () => {
    const repository = new FakeRepository();
    repository.candidates = [candidate()];
    repository.delivered.add("digest-1:user-1");

    const result = await new SendDigestUseCase(
      repository,
      new FakeDigestReader(DIGEST),
      new FakeEmailSender(),
    ).execute(NOW);

    expect(result).toEqual({ delivered: 0, failed: 0, skipped: 1 });
  });

  it("isolates a failing send: records it as failed and still delivers to the next candidate", async () => {
    const repository = new FakeRepository();
    repository.candidates = [
      candidate({ userId: "broken", email: "broken@example.de" }),
      candidate({ userId: "ok", email: "ok@example.de" }),
    ];
    const emailSender = new FakeEmailSender(new Set(["broken@example.de"]));

    const result = await new SendDigestUseCase(
      repository,
      new FakeDigestReader(DIGEST),
      emailSender,
    ).execute(NOW);

    expect(result).toEqual({ delivered: 1, failed: 1, skipped: 0 });
    expect(emailSender.sentTo).toEqual(["ok@example.de"]);
    expect(repository.recorded).toEqual([
      { digestId: "digest-1", userId: "broken", status: "failed", error: "send failed" },
      { digestId: "digest-1", userId: "ok", status: "sent" },
    ]);
  });
});
