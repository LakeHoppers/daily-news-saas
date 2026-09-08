import type { EmailSender } from "../application/ports";

const RESEND_URL = "https://api.resend.com/emails";

export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string = process.env.RESEND_API_KEY ?? "",
    private readonly from: string = process.env.EMAIL_FROM_ADDRESS ??
      "News Daily <onboarding@resend.dev>",
  ) {}

  async send(input: { to: string; subject: string; html: string; text: string }): Promise<void> {
    if (!this.apiKey) {
      throw new Error("RESEND_API_KEY is not set");
    }

    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        from: this.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resend request failed (${response.status}): ${body}`);
    }
  }
}
