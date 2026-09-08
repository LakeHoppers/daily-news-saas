export interface PipelineAlertStats {
  fetch?: { succeeded: number; failed: number; articlesFetched: number };
  cluster?: { embedded: number; failed: number; attachedToExisting: number; newStories: number };
  summarize?: { summarized: number; failed: number };
  digest?: { digestId: string; itemCount: number };
}

export interface PipelineAlertInput {
  pipelineRunId: string;
  status: "FAILED" | "PARTIAL_FAILURE";
  error?: string;
  stats?: PipelineAlertStats;
}

export interface PipelineAlertEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildLines(input: PipelineAlertInput): string[] {
  const lines: string[] = [];
  if (input.error) lines.push(`Error: ${input.error}`);
  if (input.stats?.fetch) {
    const { succeeded, failed, articlesFetched } = input.stats.fetch;
    lines.push(`Fetch: ${succeeded} sources ok, ${failed} failed, ${articlesFetched} articles`);
  }
  if (input.stats?.cluster) {
    const { embedded, failed, newStories, attachedToExisting } = input.stats.cluster;
    lines.push(
      `Cluster: ${embedded} embedded, ${failed} failed, ${newStories} new stories, ${attachedToExisting} attached to existing`,
    );
  }
  if (input.stats?.summarize) {
    const { summarized, failed } = input.stats.summarize;
    lines.push(`Summarize: ${summarized} ok, ${failed} failed`);
  }
  if (input.stats?.digest) {
    lines.push(`Digest: ${input.stats.digest.itemCount} items (${input.stats.digest.digestId})`);
  }
  return lines;
}

/** Pure formatter: given a failed/partial pipeline run, produces an internal alert email. */
export function buildPipelineAlertEmail(input: PipelineAlertInput): PipelineAlertEmail {
  const subject = `News Daily pipeline ${input.status} — run ${input.pipelineRunId}`;
  const lines = buildLines(input);

  const text = [`Pipeline run ${input.pipelineRunId} finished with status ${input.status}.`, ...lines].join(
    "\n",
  );

  const html = `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #111;">
<h1 style="font-size: 18px;">News Daily pipeline: ${escapeHtml(input.status)}</h1>
<p style="font-size: 13px; color: #666;">Run ID: ${escapeHtml(input.pipelineRunId)}</p>
<ul style="font-size: 14px; line-height: 1.6;">
${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("\n")}
</ul>
</div>`;

  return { subject, html, text };
}
