# TODO

> The service was renamed to **News Daily** after M3. Infra project
> names/slugs created before the rename (the Supabase project, the npm
> package's original folder) were not renamed to avoid unnecessary churn —
> only user-facing branding and docs were updated. See M3.5 below.

## M0 — Foundation
- [x] Scaffold Next.js (App Router, TS, Tailwind, ESLint, `src/`)
- [x] Init shadcn/ui + baseline components
- [x] Write `prisma/schema.prisma` (all entities)
- [x] Install Prisma 7 driver adapter (`@prisma/adapter-pg`, `pg`), configure
      `prisma.config.ts`, `src/shared/prisma.ts` singleton
- [x] Wire Clerk: `ClerkProvider`, `src/proxy.ts` route protection,
      sign-in/sign-up pages, header auth UI
- [x] Create clean-architecture module skeleton (`src/modules/*`,
      `src/pipeline`, `src/shared`)
- [x] Write docs (README, ARCHITECTURE, ROADMAP, TODO, API)
- [x] CI workflow (lint/typecheck/test on push)
- [x] Verify `npm run build` and `npm run dev` both succeed
- [x] Provision a real Supabase Postgres project (`germany-daily`,
      eu-central-1), fill `.env`, run `npx prisma migrate dev --name init`
      — verified live with a real query via `src/shared/prisma.ts`
- [x] Provision a real Clerk application, fill Clerk env keys (done via
      `clerk init`; sign-up/sign-in modals verified working against the
      live dev instance)
- [ ] Migrate `src/proxy.ts` off `createRouteMatcher` before Clerk removes it
      — it's deprecated in the installed version in favor of per-route
      `auth()`/`auth.protect()` checks (see the dev-server deprecation
      warning); low priority while it still works

## M1 — Ingestion pipeline ✅
- [x] `Source` seed data — 8 verified German outlets (`prisma/seed.ts`):
      Tagesschau, SZ, FAZ, Zeit, Spiegel, Handelsblatt, Tagesspiegel, DW
- [x] `FetchArticlesUseCase` (scraper/application) + `RealRssFetcher`
      (scraper/infrastructure, via `rss-parser`)
- [x] Persist `RawArticle`, dedupe by `(sourceId, externalId)` — verified
      idempotent across repeated pipeline runs
- [x] `ScrapeLog` per source per run
- [x] `GET/POST /api/cron/pipeline` (Vercel-Cron-style `Authorization: Bearer
      $CRON_SECRET`, scheduled daily in `vercel.json`) + `POST
      /api/admin/pipeline/run` (Clerk + `isAdmin` guarded, not yet live-tested
      with a real signed-in admin session)
- [x] Unit tests for scraper module with a fake `RssFetcher` + fake repository
- [x] Live-verified end-to-end against the real Supabase DB: 8/8 sources
      succeeded, ~500 real articles fetched (e.g. a real Tagesspiegel/Reuters
      Porsche layoffs story), `PipelineRun` status `SUCCESS`

### Known follow-ups from M1
- `/api/admin/pipeline/run` needs a real signed-in admin user to fully verify
  (requires setting `User.isAdmin = true` on a real Clerk-linked row)
- RSS fetching all 8 sources sequentially takes ~60-90s; consider
  `Promise.all` / concurrency limiting once source count grows
- Some feeds return very large item counts (FAZ: 167, Tagesspiegel: 100) —
  M2 dedup/ranking should handle this volume gracefully

## M2 — Dedup & clustering ✅
- [x] `Embedder`/`Summarizer` split out of `AIProvider` (interface
      segregation — dedup only depends on `Embedder`)
- [x] `embed()` via `OpenAIEmbedder` (`text-embedding-3-small`, truncated to
      256 dims for fast/cheap cosine similarity), stored on
      `RawArticle.embedding`
- [x] `ClusterArticlesUseCase`: embeds unclustered articles, first tries to
      attach to an existing recent (48h) `Story` via centroid similarity,
      then union-find clusters the remainder into new `Story` rows;
      category picked by majority vote of clustered sources' `Source.category`
- [x] `RankStoriesUseCase` + pure `computeImportanceScore` (trust score +
      corroboration count + recency, no AI involved — cheap and deterministic)
- [x] Prisma infra: `PrismaDedupRepository`, `PrismaRankingRepository`
- [x] Both stages wired into `runPipeline()` after fetch; `PipelineRunSummary`
      now reports `fetch`/`cluster`/`rank` stats
- [x] 25 unit tests total (similarity, clustering incl. transitive union-find,
      scoring, both use cases with fakes) — no DB/network needed
- [x] Live-verified against real Supabase data + real OpenAI: 560 articles
      embedded → 487 stories (41 of them real multi-article clusters). Top
      story by importance correctly merged 9 articles from 6 independent
      outlets (Spiegel, Zeit, Tagesschau, SZ, Handelsblatt, Tagesspiegel)
      into one `Story`, ranked #1 because of that corroboration

### Known follow-ups from M2
- Embeddings are called sequentially, one `await` per article (560 calls in
  the verification run) — fine at this volume, but worth batching/parallelizing
  before source count or fetch frequency grows
- `RawArticle.embedding` is a plain `Float[]`, not `pgvector` — fine at
  hundreds of rows; centroid/match queries will need a real vector index
  before this scales much further
- No time-window cutoff on `getUnclusteredArticles()` — every never-clustered
  article is embedded on every run; add a reasonable age cutoff once articles
  can go a long time without matching anything

## M3 — AI summarization ✅
- [x] `FactExtractor` + `Summarizer` interfaces (shared, provider-agnostic);
      `OpenAIFactExtractor` + `OpenAISummarizer` implementations (`gpt-4o-mini`,
      JSON mode)
- [x] Structured fact extraction prompt: grounded strictly in given article
      snippets, merges duplicate facts across sources, never invents details
- [x] Turkish generation prompt: headline/2-3 paragraph body/why-it-matters/
      category/tags, with a runtime guard that falls back to the clustering
      heuristic category if the model returns something outside the enum
- [x] `SummarizeStoryUseCase`: processes any story lacking a `Summary`
      (globally, oldest-first, capped per run — NOT scoped to "touched this
      pipeline run", since a story only needs clustering once but still
      needs summarizing even if created by an earlier run)
- [x] `PrismaSummarizerRepository`: persists `Summary` and lets the AI's own
      category call overwrite the clustering-time heuristic on `Story`
- [x] Wired into `runPipeline()` as the 4th stage; `PipelineRunSummary` now
      reports `summarize: { summarized, failed }` too
- [x] 8 unit tests (extract-then-summarize orchestration, per-story failure
      isolation, empty-backlog no-op) — fakes only, no network/DB
- [x] Live-verified: ran against 5 real un-summarized stories from the M2
      backlog with real OpenAI. Fluent, grounded Turkish output across
      distinct real stories (a CSD-attack deradicalization program, Venice's
      tourist entry fee, Gunther von Hagens' death, a Chinese chipmaker's
      IPO, a German heatwave warning) — correct category + sensible tags
      each time

### Known follow-ups from M3
- Fixed a real scoping bug before it shipped: summarization was originally
  wired to only the current run's `touchedStoryIds`, which would have
  permanently starved any story created by an earlier run that crashed
  before reaching the summarize stage. Changed to a global
  not-yet-summarized query instead.
- ~~Per-run cap is 200 stories (`DEFAULT_STORY_LIMIT`)~~ — **superseded**: once
  the digest was capped at 10 items (see below), summarizing 200
  oldest-first stories per run was pure waste (slow, costly, and didn't even
  prioritize what would make the digest). `DEFAULT_STORY_LIMIT` is now 15
  (10 + a small failure buffer) and `getStoriesNeedingSummary` orders by
  `importanceScore desc` instead of `createdAt asc`, so the pipeline only
  ever does the summarization work the digest actually needs.
- Only individual stages have been live-verified against real data so far
  (fetch+cluster+rank together in M2, summarize on its own in M3) — the
  actual `/api/cron/pipeline` route hasn't been run start-to-finish in one
  shot with a full summarize batch, since that would mean ~400 sequential
  OpenAI calls (~10-20 min). The wiring is small, typechecked, and each
  piece is proven, but that exact combination is still unexercised.
- No retry/backoff on individual OpenAI call failures (a single 429/500
  fails that one story for the run and moves on) — fine for now given
  `failed` is tracked and the story stays eligible for the next run

## Rebrand: "Germany Daily" → "News Daily" ✅
- [x] User-facing name updated: page `<title>`/metadata, site header,
      homepage copy, README, ARCHITECTURE overview
- [x] `package.json` name → `bulten-almanya`
- [ ] Not renamed (deliberately, to avoid infra churn before the product is
      finished): the Supabase project (still `germany-daily`), the local
      folder path, `vercel.json`/`.claude/launch.json` references. Full
      visual/branding pass is planned after the product itself is done.

## M4 — Digest + dashboard ✅
- [x] `BuildDigestUseCase`: picks summarized, not-yet-used stories (article
      published within 48h) ranked by `importanceScore`, upserts the day's
      `Digest`/`DigestItem` rows (capped at 10/day); wired as the 5th
      pipeline stage
- [x] Public `GET /api/digests/latest`, `GET /api/digests/:date`,
      `GET /api/stories/:id`
- [x] `getOrCreateCurrentUser()`: lazily syncs Clerk session → `User` +
      default `UserPreference` row (no webhook wired up yet — see follow-ups)
- [x] Authenticated `GET /api/me`, `PATCH /api/me/preferences`,
      `GET /api/me/digests` (history filtered to favorite categories)
- [x] Real homepage: today's digest rendered with category badges, full
      Turkish body, "why it matters" callout, tags, source domain links
- [x] `/dashboard`: category-preference checkboxes (client component, saves
      via `PATCH`) + digest history list
- [x] 3 unit tests for `BuildDigestUseCase` (ranking order, UTC day
      truncation, empty-candidates no-op) — 31 tests total now
- [x] Live-verified: built today's digest from the real backlog (5 stories),
      confirmed on the actual homepage with correct ranking/content, and
      confirmed all 3 public API routes return real data via curl

### Known follow-ups from M4
- The authenticated `/dashboard` UI itself was **not** visually verified
  signed-in — creating a test account (even via Clerk's dev-mode test-email
  shortcut) wasn't done since account creation needs explicit user sign-off.
  The server-side code it depends on (`getOrCreateCurrentUser`,
  `getDigestHistory`) is the same code already exercised elsewhere, and the
  signed-out redirect gate was confirmed working.
- No Clerk webhook yet — `User` rows only get created lazily on first
  authenticated API/page hit, not at actual Clerk sign-up time. Fine for
  now; would matter more once other systems need to know about a user
  immediately after signup (e.g. a welcome email).
- Digest "day" is a UTC calendar day, not the user's or Germany's local day
  — a story published late in the Berlin evening could land in the next
  UTC day's digest. Noted as a simplification in M0/M2 already; revisit
  once per-user delivery timing (M5) makes the mismatch actually visible.
- `MAX_DIGEST_ITEMS = 10` and the 48h freshness window are hardcoded
  constants, not configurable per environment yet.

## M5 — Email delivery ✅
- [x] `ResendEmailSender` (raw `fetch`, consistent with the OpenAI providers'
      style) implementing the notification module's `EmailSender` port
- [x] `SendDigestUseCase`: finds non-paused users, filters to those whose
      *local* hour (via `getHourInTimezone`, IANA timezone-aware) matches
      their `digestHour`, sends each their personal digest (filtered to
      favorite categories, or full digest if none chosen), records
      `DigestDelivery`, isolates per-user send failures from each other
- [x] Dedup: `hasDelivery(digestId, userId)` check before sending, so a
      cron re-run (or a user matching their hour twice due to clock skew)
      never double-sends — verified live (see below)
- [x] `GET/POST /api/cron/deliver`, hourly in `vercel.json`
      (`0 * * * *`) — necessarily more frequent than the once-daily
      pipeline cron, since it has to catch each user's local delivery hour
- [x] Real bug fixed in passing: `PATCH /api/me/preferences` accepted any
      string as `timezone` with no validation — would have crashed
      `Intl.DateTimeFormat` inside the delivery due-check the first time a
      user saved a typo'd timezone. Added `isValidTimezone()`.
- [x] HTML-escaping added to the email template — AI-generated summary text
      goes into an HTML email, so it's escaped before interpolation (a
      compromised/hallucinated AI response could otherwise inject markup)
- [x] 16 new unit tests (47 total): timezone conversion, due-check across
      timezones, HTML escaping, and the full use case (delivery, skip when
      not due, skip when no digest, skip when already delivered, per-user
      failure isolation)
- [x] Live-verified with real Resend + the one real signed-up user in the
      DB: confirmed the due-check correctly identified them as due, fetched
      their real personalized digest, attempted a real send. First attempt
      correctly failed and recorded the exact Resend sandbox-restriction
      error (expected — Resend only allows sending to the account's own
      verified email until a domain is verified); a second run with the
      delivery address redirected to the verified address produced a real
      successful send (email received) with `DigestDelivery` status `sent`,
      and a repeat run correctly skipped it (dedup confirmed)

### Known follow-ups from M5
- **Resend sandbox restriction**: until a sending domain is verified at
  resend.com/domains, delivery can only reach the Resend account's own
  email — every other real subscriber's delivery will fail with a 403.
  This blocks real usage, not just testing; verifying a domain is a
  hard prerequisite before this can deliver to actual users.
- No retry/backoff on a failed send — same policy as M3's AI calls: it's
  tracked as `failed` and will be retried next time the cron fires and the
  user's hour comes around again (i.e., ~24h later, not soon)
- `NotificationChannel` (the schema model for an alternate delivery address,
  e.g. different from the Clerk account email) is unused — delivery goes
  straight to `User.email`. Simpler for MVP since Clerk already verifies
  that email; would become relevant for a future "deliver to a different
  address" setting. Not for Telegram — that's cut, see below.
- Personalization is category-filtering only — no per-user digest ranking,
  send-time A/B, etc.

## M6 — Telegram delivery — **cut (2026-07-27), will not be built**
Emre doesn't want Telegram integration. Do not build
`/api/webhooks/telegram`, Telegram bot config, or `Channel.TELEGRAM` support.

## M7 — Monetization — built, not live-verified
- [x] `CreateCheckoutSessionUseCase` / `CreatePortalSessionUseCase`: get-or-create
      Stripe customer, real Stripe SDK (`stripe` v22) via `RealStripeGateway`
- [x] `POST /api/billing/checkout`, `POST /api/billing/portal`
- [x] `POST /api/webhooks/stripe`: verifies `stripe-signature` against
      `STRIPE_WEBHOOK_SECRET` using the raw request body, handles
      `customer.subscription.created/updated/deleted` (authoritative status —
      didn't also handle `checkout.session.completed`, since the customer↔user
      mapping is already saved before checkout even starts, and
      `customer.subscription.created` fires with full status info anyway)
- [x] `SyncSubscriptionUseCase`: maps Stripe status → our `SubscriptionStatus`/
      `SubscriptionPlan` enums, upserts `Subscription`
- [x] Free/Pro gating actually enforced: `PATCH /api/me/preferences` clamps
      `favoriteCategories` to 1 and `digestHour` to a fixed 9:00 for FREE
      users (`clampCategoriesForPlan`/`clampDigestHourForPlan`); PRO is
      unrestricted
- [x] Minimal dashboard UI: plan badge + "Pro'ya yükselt" /
      "Faturalandırmayı yönet" button (Checkout/Portal redirect)
- [x] Checked the actual installed `stripe` v22 SDK types before writing
      code rather than assuming from memory — caught a real API shape
      change: `current_period_end` moved off the top-level `Subscription`
      object onto `subscription.items.data[0]`, which would have been a
      silent `undefined` bug otherwise
- [x] 15 new unit tests (62 total): status mapping, plan-limit clamping,
      all three use cases with fake `StripeGateway`/`BillingRepository`

### Known follow-ups from M7

**Live-verified 2026-09-09** — real Stripe test-mode account created,
Managed Payments selected (Stripe as merchant of record for VAT/tax, +3.5%
fee — reasonable at pre-revenue scale, revisit once volume justifies
self-managed tax), Product "News Daily Pro" created (€4.99/month, EUR,
tax category "Digital Newspapers - Subscription"), real secret key +
webhook signing secret + Price ID (`price_1UDiKR3CitkUk0FFNiR7ata5`) wired
into both local `.env` and Vercel (production + preview). A real test-mode
checkout with Stripe's test card completed the full loop: Checkout session
→ `customer.subscription.created` webhook fired and signature-verified →
`SyncSubscriptionUseCase` synced a real `Subscription` row (plan PRO,
status ACTIVE, real `stripeCustomerId`/`stripeSubscriptionId`) → dashboard
correctly displayed "Pro üye".

- [ ] **Billing Portal not yet tested** — cancel/update-card round-trip
  (`customer.subscription.updated`/`.deleted` webhook path) is unverified.
  Should be tested next: click "Faturalandırmayı yönet", cancel the test
  subscription, confirm the `Subscription` row syncs back to FREE.
- [x] Pricing confirmed: **€4.99/month**, ad-free Pro (on top of existing
  "all categories + earlier delivery"). Free tier will be ad-supported
  once an ad network is chosen (separate backlog item, not started).
- [ ] No handling yet for a user starting a second checkout while already
  subscribed (Stripe would just let them create a duplicate subscription
  under the same customer) — worth guarding before real launch.
- [ ] Still on Stripe **test mode** — switching to Live mode (real money)
  requires completing Stripe's business verification/activation, which
  Emre has deliberately deferred (see "Business registration —
  deliberately deferred" above) until real revenue is imminent.

## M8 — Admin panel ✅
- [x] `GET/POST /api/admin/sources`, `PATCH /api/admin/sources/:id` — create,
      list, toggle active/edit trust score/category; unique-URL conflicts →
      `409`, not-found → `404`
- [x] `GET /api/admin/pipeline/runs` (filter by status), `GET
      /api/admin/scrape-logs` (filter by source/success) — and a real gap
      fixed in passing: `/api/admin/pipeline/run` (M1, force-refresh) never
      wrote an audit log entry despite `AdminAuditLog` existing since M0;
      now it does
- [x] `PATCH /api/admin/summaries/:id` — creates a new `Summary` version
      (computed via `MAX(version)` across the story, not just
      `existing.version + 1`, so it's correct even if versions have drifted)
      rather than mutating the original, `editedByAdmin`/`editedById` set
- [x] `GET /api/admin/audit-logs`
- [x] `/admin` page: sources table + add-source form + active toggle,
      force-refresh button, recent pipeline runs, recent failed scrape logs,
      latest summaries with edit links, audit log table — all Server
      Components querying Prisma directly except the small interactive bits
      (toggle/form/button), consistent with the dashboard's pattern
- [x] `/admin/summaries/:id` edit page — loads current content, saves as a
      new version via the API route
- [x] Live-verified: promoted the one real user to `isAdmin`, confirmed the
      exact Prisma queries the admin page runs return real data (8 sources,
      6 pipeline runs, 5 distinct-story summaries, 0 failed logs), confirmed
      `recordAuditLog` writes and joins to the admin's email correctly, and
      confirmed `/admin` correctly redirects signed-out visitors to sign-in

### Known follow-ups from M8
- Like the M4 dashboard, the **signed-in** `/admin` page itself was not
  visually clicked through by me — same reasoning: creating a session isn't
  something to do without you present. The underlying data queries and the
  audit-log write path were verified directly against the real database
  instead. Worth a look now that your account is `isAdmin: true`.
- No UI test for "create a source" / "edit a summary" end-to-end through the
  browser — the routes are typechecked and their read-side counterparts are
  live-verified, but the actual POST/PATCH calls haven't been exercised
  through the real HTTP+Clerk-session path, only reasoned about + the
  underlying Prisma operations spot-checked.
- `AddSourceForm` hardcodes `type: "RSS"` — reasonable since `FetchArticlesUseCase`
  only has an RSS implementation; `API`/`SCRAPER` source types exist in the
  schema but have no working fetcher, so exposing them in the form would
  create sources that silently never get scraped.

## Consistency fix (2026-09) — digest size + pipeline speed
- [x] Digest capped at 10 items/day (`MAX_DIGEST_ITEMS`), was 30
- [x] Summarization now targets exactly what the digest needs: capped at 15
      stories/run (was 200) and ordered by `importanceScore desc` (was
      oldest-first) — a run now does ~15 stories × 2 OpenAI calls instead of
      up to 200 × 2, which is the actual reason runs were taking 15-30
      minutes and felt unreliable
- [ ] **Not yet actually automatic**: nothing is deployed. The
      `vercel.json` cron schedules (`/api/cron/pipeline` daily,
      `/api/cron/deliver` hourly) only fire once this app is deployed to
      Vercel — every run so far (M1 through the Neon migration) has been
      triggered manually, by hand, from this session. "Every day
      automatically" requires deployment; see M9.

## M9 — Hardening & launch
- [ ] **Deploy to Vercel** — hard prerequisite for the cron schedules in
      `vercel.json` to run on their own. Needs: a Vercel account (GitHub remote now exists at
      `LakeHoppers/daily-news-saas`),
      and every `.env` var re-entered in the Vercel project's environment
      variables (they don't carry over from a local `.env` automatically)
- [ ] Test coverage pass across all modules
- [ ] Sentry (or equivalent) error alerting
- [ ] Rate limiting on public routes
- [ ] Soft launch

## Deployment readiness — 2026-09-07
- [x] Confirmed clean starting working tree and GitHub remote.
- [x] Verified 69 tests across 17 files, ESLint, production build, and TypeScript.
- [x] Build now runs `prisma generate` before `next build`, so fresh checkouts
      do not depend on an ignored, locally generated client.
- [x] Cron authentication rejects missing/blank configuration, including
      `Bearer undefined`; seven regression cases cover the guard.
- [ ] Vercel CLI login started; account authentication is pending. No deployment
      or environment-variable transfer has occurred in this verification pass.
- [ ] Resolve scheduler/plan compatibility: Vercel Hobby only supports daily
      cron schedules; the configured hourly delivery schedule requires a
      compatible plan or another scheduler. See
      https://vercel.com/docs/cron-jobs/usage-and-pricing.
- [ ] Resolve the existing single-request pipeline timeout risk before claiming
      reliable automation; reducing summaries to 15 does not bound embedding time.
- [ ] Verify a real scheduled execution after deployment; manual execution alone
      is not proof that automatic scheduling works.

Database is now Neon (fresh provision); earlier Supabase verification entries
above are historical. Stripe and Resend-domain limitations remain unchanged.

## Free-tier scheduling changes — 2026-09-07
- [x] Fetch all RSS sources concurrently; preserve per-source failure logs and
      wait for every source before surfacing log-persistence failures.
- [x] Bound embeddings to 15 workers, reuse cached vectors, skip failed articles
      without clustering them; expose `cluster.failed` in stats and partial status.
      Previous embedding code had no per-article isolation; this adds it.
- [x] Explicit Hobby Fluid Compute `maxDuration = 300` on pipeline cron route.
- [x] Remove hourly delivery from Vercel crons; add configurable GitHub Actions
      workflow using `secrets.CRON_SECRET` and `vars.PRODUCTION_URL`.
- [x] 71 tests, lint, build, typecheck and actionlint pass.
- [x] Live timed pipeline: **336.96s**, 495 articles, 379 embeddings, 335 new
      stories, 15 summaries, 10 digest items, zero reported failures.
- [ ] **Still exceeds Hobby timeout**: split pipeline into resumable bounded steps.
- [ ] Authenticate GitHub and upload CRON_SECRET; upload was not possible yet.
- [ ] Set PRODUCTION_URL after deployment; push workflow and verify scheduled run.

See [DEPLOYMENT.md](DEPLOYMENT.md) for exact setup, evidence and remaining risks.
This section supersedes the earlier sequential-fetch/embedding follow-ups and
hourly-Vercel-schedule notes; historical verification records are retained.

## Summarization concurrency and late delivery — 2026-09-07
- [x] Five concurrent story workers, each extracting before summarizing; preserve
      isolation for extraction, generation and persistence failures.
- [x] Late hourly invocations catch up with local hour >= preferred hour.
- [x] Fix real repository/fake mismatch: only status `sent` counts as received;
      failed rows can retry. Skip stale editions using existing UTC digest dates.
- [x] 83 tests / 18 files, lint, typecheck, production build pass. Tests cover
      delayed and skipped hours, repeat runs, retries, next day, DST, concurrency.
- [x] Live run `cmtrfbug500007y5ry8k85e6z`: **128.35s**; 496 fetched,
      44 embedded, 32 new stories, 15 summaries, 10 selected digest items,
      no reported failures. Margin: 171.65s under Hobby maxDuration.
- [ ] Validate representative deployed daily runtime. This run reused more data
      than the 336.96s baseline; do not attribute all improvement to concurrency.
      **Splitting is no longer required by this measurement**; retain one stage.
- [x] Vercel CLI sign-in confirmed. GitHub CLI remains unauthenticated.
- [ ] Founder handles CRON_SECRET manually; set PRODUCTION_URL after deployment
      and push workflow to default branch once GitHub access is available.

These findings supersede the preceding split-required and exact-hour notes.
Sequential reruns are deduplicated, but concurrent manual calls or an email-provider
success followed by DB failure can still duplicate mail (atomic/provider
idempotency remains separate hardening work).

## Python migration phase 0–1 (2026-09-07)
- [x] Hosting/ORM/migration/auth/layout decisions documented in PYTHON_MIGRATION.md.
- [x] Read-only SQLAlchemy + FastAPI latest digest slice, 7 Python tests including
      real Neon verification, and actual HTTP parity with the TS endpoint.
- [x] Homepage HTTP path verified visually in a production-mode local Next server;
      PYTHON_BACKEND_URL is opt-in so existing deployments keep working.
- [x] 87 TS tests, lint, typecheck, build; Python Ruff checks pass.
- [ ] Review phase 2–4 proposal before implementation; no other route ported yet.
- [ ] Phase-2 writer follow-up: reruns accumulated 20 stored items in today's
      edition despite selection cap 10. Read-only slice intentionally preserves it.

## Final product name — 2026-09-08
The final product name is **News Daily**. UI, metadata, email templates, default
sender display name, Python API title and documentation use this name. Turkish
body copy is unchanged. Existing infrastructure/package identifiers stay stable.

## Digest replacement and coverage — 2026-09-08
- [x] Same-day item replacement is atomic: get/create the digest, delete stale
      items, upsert ranked replacements in one transaction, including empty lists.
- [x] Parent-row update serializes replacement writes to the same edition.
- [x] Category-aware candidate pool (10/category) and soft cap 4/10; fallback fills
      by importance when variety is insufficient. Deterministic ID tie-breaking.
- [x] Seven publisher-verified RSS/Atom feeds added; catalog now 15. See SOURCES.md
      for URLs, categories, trust scores, counts and freshness caveats.
- [x] Applied the idempotent seed to the live database: 15 sources seeded.
- [x] Verification: 94 TypeScript tests, lint, typecheck and production build pass;
      Python checks also pass (6 tests, 1 opt-in live test skipped; Ruff clean).
- [x] Regression tests cover repeated same-day sets, empty replacement, rollback,
      other-edition isolation, skewed categories and single-category full digests.
- [ ] Existing oversized editions are corrected when next rebuilt; this change
      does not retrospectively edit old editions or resend delivered email.

The global unused-story filter is intentionally unchanged: a same-day rerun can
choose different stories and replace its edition. Stable published editions and
publisher-level corroboration remain future policy work. Earlier accumulation
follow-ups in this log are superseded by this fix.

## First production deploy + hardening — 2026-09-08
- [x] Vercel project deployed to production (`daily-news-saas.vercel.app`);
      GitHub Actions hourly delivery activated (`PRODUCTION_URL` + `CRON_SECRET`).
- [x] Fixed a real `FUNCTION_INVOCATION_TIMEOUT`: adding 7 new sources produced a
      one-time backlog large enough to exceed Hobby's 300s limit. Capped
      `getUnclusteredArticles` at 150 articles/run (ordered by `publishedAt desc`).
- [x] Added a pipeline-failure alert email (`PIPELINE_ALERT_EMAIL`) — FAILED/
      PARTIAL_FAILURE or a crash now emails a summary instead of failing silently.
- [x] Homepage redesign: editorial layout (serif headlines, per-category accent
      colors, numbered entries), dark mode (next-themes + header toggle), a
      logomark, and a real favicon. Replaced the leftover "MVP altyapısı
      kuruluyor" placeholder with an actual tagline. Renamed "Panelim" →
      "Hesabım" in the header/dashboard.
- [ ] Old oversized editions (30/20-item days from before the replacement fix)
      still display as-is until next rebuilt for that date — not retroactively
      corrected.

## English translation (v1) — 2026-09-08
- [x] Cheaper approach than a second summarization pass: translate the
      already-written Turkish `Summary` (headline/body/whyItMatters) with one
      GPT-4o-mini call per story, not a full extract+generate pass in English.
      New `Translator` interface + `OpenAITranslator`
      (`src/modules/ai/providers/openai-translator.ts`).
- [x] Schema: nullable `headlineEn`/`bodyEn`/`whyItMattersEn` on `Summary`
      (migration `20260908114909_add_summary_english_fields`, applied to the
      live Neon DB). Tags are intentionally left untranslated for v1 (still
      Turkish keywords in the English view) — revisit if that reads oddly once
      the English audience actually uses it.
- [x] New pipeline stage `TranslateStoriesUseCase`, run after digest assembly
      so it only translates the day's ~10 selected stories (not every
      candidate) — cheap and bounded, same failure-isolation pattern as
      summarization.
- [x] Read side: `getLatestDigest`/`getDigestByDate` take a `locale` ("tr" |
      "en"), falling back to Turkish per-field if a story hasn't been
      translated yet (`pickLocalizedText`). `/api/digests/latest?lang=en`
      wired; `getHomeDigest` passes locale through to both the Prisma path and
      the (currently inactive) Python backend path.
- [x] Homepage: a TR/EN toggle (`?lang=en`), localized static copy
      (`src/shared/home-copy.ts`), and English category labels
      (`CATEGORY_LABELS_EN`).
- [x] Live-verified: a real pipeline run translated 10/10 stories with 0
      failures (195s total), and `/?lang=tr` and `/?lang=en` both render
      correctly on production.
- [ ] Site-wide locale (dashboard/admin/email) is out of scope for v1 — only
      the public homepage digest is bilingual so far. Scoped as a Codex task
      (locale-based routing, header/Clerk auth UI, migrate the `?lang=`
      homepage mechanism onto it) — not yet picked up.
- [ ] Story tags (e.g. "Huthi", "Suudi Arabistan") hidden from the homepage
      (2026-09-08) — they rendered as bordered pills that looked clickable but
      weren't. Data/`Summary.tags` untouched; either restyle as plain
      non-interactive text or make them a real tag-filter feature later.

## Category misassignment fix — 2026-09-08
- [x] Spotted in production: a Sachsen-Anhalt election story showed as
      ECONOMY, and general-industry stories showed as BERLIN. Root cause:
      `pickCategory()` (clustering) picks the majority *source's* fixed
      category among a story's articles, and the summarizer prompt told the
      AI to "prefer the candidate category unless clearly wrong" — so a
      Tagesspiegel/Handelsblatt byline kept steering unrelated stories into
      BERLIN/ECONOMY regardless of actual content.
- [x] Flipped the summarizer prompt: classify strictly from the facts, treat
      the candidate as a weak fallback hint only for genuinely ambiguous
      cases; clarified BERLIN means the story is actually about Berlin, not
      merely reported by a Berlin outlet.
- [ ] **Forward-looking only** — already-published stories keep their
      existing (possibly wrong) category unless manually corrected via
      `/admin`. Not retroactively fixed.
- [ ] Underlying structural weakness not addressed: `pickCategory()` still
      assigns a *candidate* category from source tags before the AI ever
      sees the story, for every source (not just multi-topic outlets). A
      real content classifier at clustering time (instead of source-vote)
      would be a more durable fix if this keeps recurring — flag to Codex if
      the prompt fix alone doesn't hold up.

## Known correctness gaps in the translator (flagged by Codex review, 2026-09-08)
- [x] **Original issue: failed translations never retry (fixed below).** `TranslateStoriesUseCase` only ever
      runs against the current run's freshly-selected digest story ids. Since
      a story is excluded from all future digest candidate pools once it's
      been used in any digest (same rule that lets same-day reruns pick fresh
      stories), a story whose translation fails today can never come up again
      to retry — it's stuck showing the Turkish fallback forever. This is the
      same class of bug M3's summarization step already hit once (see
      "Fixed a real scoping bug before it shipped" above) — needs the same
      fix: scan for untranslated summaries independent of "this run's
      selection" (e.g. across the last few days' digests), not just
      `digestResult.storyIds`.
- [x] **Translator validation fixed below**: originally `OpenAITranslator` validated output with a truthiness check
      (`!parsed.headline`) rather than a real non-empty-string check — matches
      the exact same pattern already in `OpenAISummarizer`, so not a
      regression, but both could be tightened together for consistency.
Resolved for the translator below on 2026-09-08; the historical findings above describe the original behavior. Summarizer validation remains separate.

## Email delivery is still Turkish-only and undesigned (flagged 2026-09-08)
- [ ] `PrismaDigestReader` (notification module) calls `getLatestDigest`
      without a locale, so delivered emails are always Turkish regardless of
      any future language preference — the English translation feature only
      reaches the homepage so far.
- [ ] The email template (`src/modules/notification/domain/email-template.ts`)
      still uses the old plain inline-style HTML from before the homepage
      redesign — doesn't match the new editorial look at all. Needs a design
      pass once real delivery is unblocked (see domain/Resend below) — no
      point polishing an email nobody but Emre can currently receive.

## Sending domain — sequencing decision (2026-09-08)
Emre wants to **finish the market-facing name decision first** (see "Rename to
Morning Dose" above) before buying a domain — buying one now under a name that
might change within days would be wasted money and require re-verifying a new
domain later anyway.
- [ ] Once the name is locked: buy a domain (or use a subdomain of an
      existing one Emre owns, e.g. `news.synch.coach` — his call, no specific
      registrar suggested per his standing instruction) → add it in Resend
      (Domains → Add Domain) → add the SPF/DKIM DNS records Resend provides
      at the registrar/DNS host → wait for verification → then I update
      `EMAIL_FROM_ADDRESS` (local `.env` + Vercel) and redeploy.
- [ ] **Remind Emre about this proactively** (his explicit request) whenever
      picking this project back up, alongside the other backlog items above.

## Business registration — deliberately deferred (2026-09-09)
Emre lives in and pays tax in Germany (not Turkey/US as earlier assumed —
corrected here). Incorporating outside Germany would add complexity, not
reduce it (German CFC/Hinzurechnungsbesteuerung rules can still tax a
German-resident-owned foreign company). Trademark filing should also happen
in Germany (DPMA) or EU-wide (EUIPO), not TR/US, once the brand name is
locked.

**Explicitly not doing yet, on purpose**: registering as Freiberufler/Gewerbe
with the Finanzamt, electing Kleinunternehmerregelung, or setting up Stripe's
individual/sole-proprietor payout flow. There is no real revenue or imminent
revenue event yet (monetization — see ad-supported free tier below — hasn't
started), and this registration should happen right before the first real
transaction, not speculatively during product validation. Revisit this
exact thread when ad/subscription revenue is actually about to go live.

## Product backlog (not started — flag to Emre before picking any of these up)
- [ ] **Rename to "Morning Dose"**: proposed as the final brand name, bundled
      with the English launch rather than done separately (already renamed
      product twice this week; avoid a third mid-air change). Needs Emre's
      go-ahead on timing.
- [ ] **Monetization: ad-supported free tier**: Free = ads, Pro = ad-free (on
      top of the existing "all categories + earlier delivery" Pro value).
      Needs an ad network decision (e.g. AdSense) and consent/GDPR handling
      for EU visitors — not started.
- [ ] **Voice/audio digest ("listen in the car")**: read the daily digest
      aloud via TTS. Proposed default approach: OpenAI TTS (already using
      OpenAI elsewhere), one combined audio file per day's digest (not
      per-story), stored in Vercel Blob, URL on the `Digest` row, a play
      button on the homepage. Needs a decision on TTS provider/voice quality
      before starting — not scoped in code yet.


## Translation retries and dedup investigation — 2026-09-08
- [x] Translation stage now also queries up to five incomplete latest summaries
      from published digests, independently of current selected story IDs.
      All publication dates are eligible; oldest first, excluding current IDs.
      Completed English fields remove a summary from the retry pool. Partial or
      blank translations qualify too. Older summary versions do not consume slots.
- [x] Current translations retain five-worker concurrency; the extra retry budget
      is five calls per run. Translator requests have a 30-second timeout.
- [x] OpenAITranslator rejects non-string and whitespace-only fields before saving.
- [x] 118 tests pass, including failure on one run followed by successful retry
      with different selections, completion exclusion, retry budgeting, and malformed
      provider output. Typecheck, lint and production build pass. Live Neon read-only queries returned
      five pending retries and five different records when excluding that first set.
- [ ] Five persistently failing oldest summaries could occupy all retry slots.
      Persisted attempt counters/backoff and fair scheduling remain hardening work.
- [ ] Added retry calls may increase pipeline runtime. No full pipeline or email
      send was triggered for this task; the prior 195s measurement predates retries.
- [x] Investigated the reported sabotage duplicate using existing live embeddings:
      same-run creation 0.389 seconds apart, maximum cross-cluster article cosine
      0.773831, centroid cosine 0.824298; RSS bodies only 119–221 characters.
      See DEDUP_INVESTIGATION.md. Threshold unchanged; existing rows not merged.
- [ ] Calibrate event-level duplicate detection with positive AND negative examples
      before changing the 0.83 threshold or adding a second-stage verifier.


## Python phase 2a — 2026-09-08
- [x] Restructured phase 2 into independently reviewable 2a/2b/2c; production
      scheduler and authoritative-write cutover remain phase 4. Estimates and
      detailed rationale in PYTHON_MIGRATION.md.
- [x] Python read-only RSS/Atom normalization, concurrent fetching, cached-vector
      dedup/centroid matching and deterministic ranking. No new dependencies.
- [x] Real dry-run parity: 15 feeds, 926 items; all normalized fields match TS.
      150 historical articles reproduce 111 stored clusters and 18 attachments;
      all 124 ranking scores match the TS oracle. 7.661s, zero AI calls/writes.
- [x] 2b: OpenAI embeddings/summarization/translation sample verification.
- [x] 2c: full manual isolated-output orchestration and real <300s timing.
- [ ] 4: production scheduling/sole writer, deployment and migrations cutover;
      explicitly not part of phase 2.

Phase 2a final checks: 118 TS tests and 18 Python tests (including both live
read-only checks) pass; Ruff check/format, ESLint, typecheck and production build pass.


## Python phases 2b–2c — 2026-09-08
- [x] Live Python and TS AI samples, output validation and bounded transient retry.
- [x] Complete local-only pipeline: fresh RSS, 150 embeddings, 139 clusters,
      15 summaries, ten-story digest and ten translations; 23.602s, zero failures.
- [x] Independent live TS run matches all groups, ranks and ten selected IDs.
- [x] Regression tests for worker limits, cancellation, invalid output, category
      balance, latest-version translation retry and partial-run resume.
- [ ] Broader editorial QA: rare semantic errors, generic implications, paragraph
      count and English words in Turkish headlines remain model-quality risks.
- [ ] Production persistence, distributed job ownership, scheduling and host runtime
      measurements remain phase 4; no Python shared-table writes were introduced.
See PYTHON_PIPELINE_VERIFICATION.md and verification/phase-2bc.json for evidence.

Phases 2b–2c final gates: 118 TS tests, 31 Python tests including live reads,
Ruff, lint, typecheck and production build all pass.


## Site-wide TR/EN routing (2026-09-09)

- [x] Move page/root layout to `[locale]`; header/footer, metadata and HTML
  language follow the path. Legacy query-based homepage switches redirect only.
- [x] Localize dashboard, preferences, billing controls and digest history.
  Preserve category filtering and untranslated-story fallback. Refresh history
  after preference saves; preserve locale through Stripe return URLs.
- [x] Add Clerk localization dictionaries for sign-in/sign-up/account UI, retaining
  the existing appearance. Language switching reloads the current page so Clerk
  and app locale change together. Internal admin stays Turkish at `/tr/admin`.
- [x] Regression coverage for redirects, protected paths, excluded machine routes,
  localized history and validated billing return URLs.
- [x] Browser verified the local production build: English homepage with real
  10-story digest, English sign-in modal, Turkish sign-up page, localized header
  and footer, and English dashboard's sign-in redirect. Unsupported `/de` gives
  404; unauthenticated cron request remains 401.

Known follow-ups: this browser session was signed out; authenticated account-modal
click-through and signed-in dashboard were not live-verified in this pass.
Clerk's community Turkish dictionary can fall back to English for missing keys
(e.g. the password placeholder); app-owned copy is localized. Email delivery stays
Turkish as recorded above. No scheduling, schema or production account changes.

Verification: 142 tests across 27 files passed; ESLint, standalone TypeScript
check and Next.js production build passed. Stale `.next/dev/types` from before
the route move were cleared and regenerated build types used for verification.


## Python Phase 3a — read-only API parity (2026-09-09)

- [x] Phase 3 split into five slices with revised 12–17 engineering-day estimate;
  see PYTHON_MIGRATION.md. Stripe and site-localization prerequisites cleared.
- [x] Python latest-digest English fields/fallback, dated editions and story detail.
- [x] Internal existing-user/preferences/subscription and category-filtered history
  queries. No authenticated route exposed before the 3b Clerk verifier exists.
- [x] Real TS/Python read comparison: 16 public responses, 20 history combinations,
  one existing user and personalized history, all match; connections read-only.
- [x] 47 Python tests (including three live), 142 TS tests, Ruff check/format,
  lint/typecheck/build passed. Fixed a live-discovered enum/text filtering mismatch.

Known follow-ups: 3b Clerk verification/protected routes/preferences writes, 3c
email, 3d admin/audit, 3e billing are not implemented by 3a. Impossible dates are
rejected with 400 rather than copying TS Date normalization; old equal-rank digest
ordering is normalized in comparisons. User provisioning remains on the TS writer.
No frontend, scheduler, email send, database migration or production write changed.

## Data residency / GDPR — Tolga flagged this, real priority (2026-09-09)

Raised by Tolga after seeing the live site being shared with real people (even
3-5 friends/family counts under GDPR — no user-count threshold). Researched each
provider directly (see sources in chat, not just general knowledge):

- [x] **Neon** (database): EU — Frankfurt (`eu-central-1`, AWS). Confirmed from
  our own connection string. No action needed.
- [ ] **Vercel** (app/API servers): currently **US** (`iad1`, Vercel's default
  for all new projects). Fixable and cheap: Hobby plan allows a single custom
  region (just not multiple) — add `"regions": ["fra1"]` to `vercel.json` to
  move to Frankfurt. Not done yet — do this first when picking this back up.
- [x] **Resend** (email): confirmed via Resend's own GDPR page — data is
  **always** stored in the US regardless of sending region; no EU residency
  option exists at all. Emre explicitly decided this is fine (legal safeguards
  — DPA, SCCs, EU-US Data Privacy Framework — are enough; no requirement for
  EU-only storage). Not a blocker, don't revisit unless Emre changes his mind.
- [ ] **Clerk** (auth): unclear whether EU data residency is included on our
  (free/dev) plan or is a paid/Enterprise add-on. Emre emailed
  privacy@clerk.dev on 2026-09-09 asking exactly this. **Waiting on their
  reply** — check back proactively, don't wait to be asked.
- [x] **Stripe**: already GDPR-mature, Managed Payments adds further coverage.
  No action needed.
- [x] **OpenAI**: only processes news article content, never user personal
  data (name/email/preferences). Low risk, no action needed.

Also still missing: an actual **Privacy Policy** on the site — required once
any real personal data is collected, regardless of company/entity status
(Emre is the data controller personally, per GDPR, even without a registered
business — see the deliberately-deferred business-registration note above).
Not written yet.

**Sequencing**: Emre said to prioritize this right after whatever he's
currently mid-task on — treat it as the next real priority, not backlog.
