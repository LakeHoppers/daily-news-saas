# Free-tier deployment setup

## Runtime and daily pipeline

Keep Fluid Compute enabled in Vercel. Its current Hobby maximum is **300 seconds**;
`src/app/api/cron/pipeline/route.ts` explicitly exports `maxDuration = 300`.
Source: https://vercel.com/docs/functions/configuring-functions/duration
(checked 2026-09-07). Only the daily 05:00 UTC pipeline remains in `vercel.json`.

## Latest live measurement: five summarization workers

On 2026-09-07 the full live pipeline completed in **128.35 seconds**, leaving
**171.65 seconds** below the 300-second limit. Run ID:
`cmtrfbug500007y5ry8k85e6z`. Eight successful sources, 496 fetched articles,
44 new embeddings, 32 new stories, 38 ranked stories, 15 successful summaries,
and 10 selected digest items; no reported failures.

The earlier run took 336.96 seconds with sequential summarization, 379 new
embeddings and 335 new stories. These are different live workloads, not a
controlled speedup comparison. Both performed 15 real extract-then-summarize
operations. This measures the orchestrator locally against live RSS, Neon and
OpenAI, not Vercel cold-start or HTTP overhead. The measured margin supports
keeping the single-stage pipeline for now; validate another representative daily
run after deployment before claiming a runtime guarantee.

Summarization uses five workers; each worker awaits extraction, generation and
persistence in order, isolating failures per story. Five overlaps slow chat I/O
while limiting chat concurrency below the 15-worker embedding limit. Per-source
article writes and story assignment remain sequential. Application-level network
timeouts and retry/backoff remain follow-ups; concurrency is not an RPM/TPM limiter.

To reproduce (writes live data and incurs AI usage):

```sh
npx tsx scripts/time-pipeline.ts
```

## Hourly email via GitHub Actions

`.github/workflows/hourly-deliver.yml` runs at `0 * * * *` and supports manual
`workflow_dispatch`. It uses no checkout or third-party action. It serializes
workflow runs, rejects redirects/non-200 responses and fails when the endpoint
reports failed deliveries. It intentionally does not automatically retry a send
whose outcome may be ambiguous. It does not invoke email during local validation.

Before activation:

1. Vercel CLI is authenticated as of this pass; deployment and production URL
   are still pending. Configure its CRON_SECRET privately.
2. In LakeHoppers/daily-news-saas → Settings → Secrets and variables → Actions,
   add repository secret **CRON_SECRET**, identical to the Vercel value. Use a
   strong random secret, never an example/placeholder. The founder is adding this manually; this pass did not modify it. GitHub CLI
   remains unauthenticated, so repository configuration is not yet accessible.
3. Add repository variable **PRODUCTION_URL**, e.g. `https://your-app.vercel.app`.
   No production URL is assumed or hardcoded. An unset variable fails clearly.
4. Merge/push the workflow to the default branch. Local creation does not activate
   schedules. Allow the authorized scheduler through deployment protection if
   protection is enabled; do not expose admin routes.
5. Once Resend domain restrictions permit the intended recipient, manually verify
   delivery and then inspect a genuine scheduled run before calling it automatic.

GitHub schedules may be delayed or dropped under load, particularly at minute 0:
https://docs.github.com/en/actions/how-tos/troubleshoot-workflows
Delivery now catches up at or after the user's preferred local hour. Successful
DigestDelivery records suppress later invocations for that edition; failed records
remain retryable. Only the current UTC-dated edition is eligible, matching the
existing digest date convention. At local midnight, eligibility resets to before
the preferred hour. This does not backfill previous days if no run succeeds all day. Workflow serialization does not prevent races with
manual API calls; existing delivery deduplication is not an atomic send claim.
GitHub Actions availability/usage quotas and inactive-repository schedule rules
still apply. This is not an exact-time delivery guarantee.

## Validation

2026-09-07: 83 tests across 18 files pass; ESLint, production build and typecheck
pass. `actionlint` v1.7.12 validates the hourly workflow with exit 0; no workflow
was dispatched. Regression tests cover all-eight-feed concurrency and source
failure isolation, a 15-request embedding bound, and isolated embedding API/DB
persistence failures. Added coverage for five-worker chat concurrency and failures
in extraction/generation/persistence, delayed/skipped scheduled hours, repeated late
runs, DST transitions, stale editions, next-day editions and failed-send retries.
Production deployment, repository URL configuration and scheduled delivery remain
pending. With GitHub authentication available, the agent can set PRODUCTION_URL
and push the workflow; otherwise these steps need manual completion. No email
was sent during this verification pass.
