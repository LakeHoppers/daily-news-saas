import { describe, expect, it } from "vitest";
import { buildPipelineAlertEmail } from "@/modules/notification/domain/pipeline-alert-email";

describe("buildPipelineAlertEmail", () => {
  it("includes the run id and status in the subject", () => {
    const { subject } = buildPipelineAlertEmail({
      pipelineRunId: "run-1",
      status: "FAILED",
      error: "boom",
    });
    expect(subject).toContain("run-1");
    expect(subject).toContain("FAILED");
  });

  it("includes the error message when the run crashed", () => {
    const { text, html } = buildPipelineAlertEmail({
      pipelineRunId: "run-1",
      status: "FAILED",
      error: "Neon connection refused",
    });
    expect(text).toContain("Neon connection refused");
    expect(html).toContain("Neon connection refused");
  });

  it("summarizes per-stage stats for a partial failure", () => {
    const { text } = buildPipelineAlertEmail({
      pipelineRunId: "run-2",
      status: "PARTIAL_FAILURE",
      stats: {
        fetch: { succeeded: 14, failed: 1, articlesFetched: 900 },
        cluster: { embedded: 50, failed: 2, newStories: 40, attachedToExisting: 8 },
        summarize: { summarized: 14, failed: 1 },
        digest: { digestId: "digest-1", itemCount: 10 },
      },
    });
    expect(text).toContain("14 sources ok, 1 failed");
    expect(text).toContain("2 failed");
    expect(text).toContain("10 items");
  });

  it("escapes HTML-unsafe error content", () => {
    const { html } = buildPipelineAlertEmail({
      pipelineRunId: "run-1",
      status: "FAILED",
      error: "<script>alert(1)</script>",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
