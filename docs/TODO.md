# TODO

> The service was renamed to **Bülten Almanya** after M3. Infra project
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
- Per-run cap is 200 stories (`DEFAULT_STORY_LIMIT`) — with ~487 already
  backlogged from M2 testing, it'll take a few cron runs to fully catch up;
  this is intentional (bounds cost/time per run) rather than a bug
- Only individual stages have been live-verified against real data so far
  (fetch+cluster+rank together in M2, summarize on its own in M3) — the
  actual `/api/cron/pipeline` route hasn't been run start-to-finish in one
  shot with a full summarize batch, since that would mean ~400 sequential
  OpenAI calls (~10-20 min). The wiring is small, typechecked, and each
  piece is proven, but that exact combination is still unexercised.
- No retry/backoff on individual OpenAI call failures (a single 429/500
  fails that one story for the run and moves on) — fine for now given
  `failed` is tracked and the story stays eligible for the next run

## Rebrand: "Germany Daily" → "Bülten Almanya" ✅
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
      `Digest`/`DigestItem` rows (capped at 30/day); wired as the 5th
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
- `MAX_DIGEST_ITEMS = 30` and the 48h freshness window are hardcoded
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
- **Not live-verified.** No real Stripe test-mode credentials yet (secret
  key, Pro price ID, webhook signing secret) — Emre chose to defer this.
  Before trusting this in production: run a real test-mode checkout,
  confirm the webhook fires and `Subscription` updates, confirm gating
  actually changes behavior for a real FREE vs PRO user, and confirm the
  Billing Portal (cancel/update card) round-trips correctly back to a
  synced `Subscription` row.
- Free/Pro limits (`FREE_MAX_CATEGORIES = 1`, `FREE_DIGEST_HOUR = 9`) are
  a first guess at "Pro = all categories + earlier delivery" from the
  original spec — Emre hasn't confirmed actual pricing/limits.
- No handling yet for a user starting a second checkout while already
  subscribed (Stripe would just let them create a duplicate subscription
  under the same customer) — worth guarding before real launch.

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

## M9 — Hardening & launch
- [ ] Test coverage pass across all modules
- [ ] Sentry (or equivalent) error alerting
- [ ] Rate limiting on public routes
- [ ] Soft launch
