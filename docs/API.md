# API

All routes are Next.js App Router Route Handlers under `src/app/api/**/route.ts`.
Implemented so far: `/api/cron/pipeline`, `/api/admin/pipeline/run` (M1);
`/api/digests/latest`, `/api/digests/:date`, `/api/stories/:id`, `/api/me`,
`/api/me/preferences`, `/api/me/digests` (M4); `/api/cron/deliver` (M5);
`/api/billing/checkout`, `/api/billing/portal`, `/api/webhooks/stripe` (M7 —
built and unit-tested, not yet live-verified against real Stripe);
`/api/admin/sources`, `/api/admin/sources/:id`, `/api/admin/pipeline/runs`,
`/api/admin/scrape-logs`, `/api/admin/summaries/:id`,
`/api/admin/audit-logs` (M8). Channel-management routes are still the
contract to build against, lower priority now that delivery goes straight
to `User.email`. Telegram routes are cut from scope entirely.

## Conventions

- JSON in, JSON out. Errors: `{ "error": string }` with a 4xx/5xx status.
- Authenticated routes require a valid Clerk session; unauthenticated
  requests get `401`.
- Admin routes additionally require `User.isAdmin === true`; otherwise `403`.
- Cron/internal routes require header `Authorization: Bearer $CRON_SECRET`
  (this is Vercel Cron's own convention — it adds this header automatically
  when a `CRON_SECRET` env var is set, invoking the path with `GET`);
  otherwise `401`, including when `CRON_SECRET` is missing or blank.
  These endpoints are intended for trusted schedulers/operators.
- Dates are ISO 8601. `category` values are the `Category` enum
  (`POLITICS`, `ECONOMY`, `IMMIGRATION`, `BERLIN`, `TECHNOLOGY`, `EUROPE`,
  `BUSINESS`, `SOCIETY`, `SPORTS`).

---

## Public / user-facing

### `GET /api/digests/latest`
Today's digest (public preview — limited item count for signed-out users).

Response `200`:
```json
{
  "date": "2026-07-27",
  "items": [
    {
      "rank": 1,
      "storyId": "clx...",
      "category": "POLITICS",
      "headline": "...",
      "summary": "...",
      "whyItMatters": "...",
      "tags": ["..."],
      "sourceUrls": ["https://..."]
    }
  ]
}
```

### `GET /api/digests/:date`
Digest for a specific date (`YYYY-MM-DD`). `404` if none generated yet.

### `GET /api/stories/:id`
Single story detail: full summary, source articles, importance score.

---

## Authenticated

### `GET /api/me`
Current user + preferences + subscription.

Response `200`:
```json
{
  "id": "clx...",
  "email": "user@example.com",
  "preference": {
    "favoriteCategories": ["POLITICS", "ECONOMY"],
    "digestHour": 7,
    "timezone": "Europe/Berlin",
    "paused": false
  },
  "subscription": { "plan": "FREE", "status": "ACTIVE" }
}
```

### `PATCH /api/me/preferences`
Body: partial `{ favoriteCategories?, digestHour?, timezone?, paused? }`.
Free/Pro gated: FREE users' `favoriteCategories` is silently clamped to 1
category and `digestHour` forced to a fixed 9; PRO is unrestricted. Response
`200`: updated `UserPreference` (reflects the clamped values, not what was
requested).

### `POST /api/me/channels`
Not yet built, and lower priority than originally planned — delivery
currently goes straight to `User.email` (see M5), which covers the common
case without needing this. Kept for a possible future "deliver to a
different address" setting. Body: `{ "channel": "EMAIL" | "WHATSAPP",
"address": string }` (`TELEGRAM` removed from scope — see M6 in ROADMAP.md).
Response `201`: created `NotificationChannel` (unverified).

### `DELETE /api/me/channels/:id`
Response `204`.

### `POST /api/me/channels/:id/verify`
Body: `{ "code": string }`. Response `200`: `{ "verified": true }` or `400`
on bad code.

### `GET /api/me/digests`
Personalized digest history, filtered to `favoriteCategories` (empty =
unfiltered). Query params: `?limit=20` (default 14, max 50). Response `200`:
`{ "digests": [{ "date": "YYYY-MM-DD", "items": [{ "rank", "storyId", "category", "headline" }] }] }`.

---

## Billing

### `POST /api/billing/checkout`
Body: `{ "priceId"?: string }` — defaults to `STRIPE_PRO_PRICE_ID` if
omitted. Creates a Stripe customer for the user on first call (reused after
that). Response `200`: `{ "url": string }` (Stripe Checkout session URL to
redirect to).

### `POST /api/billing/portal`
Response `200`: `{ "url": string }` (Stripe Billing Portal session URL).
`400` if the user has never checked out (no Stripe customer yet).

### `POST /api/webhooks/stripe`
Stripe webhook. Verifies `stripe-signature` against `STRIPE_WEBHOOK_SECRET`
using the raw request body (required for HMAC verification — don't add body
parsing middleware in front of this route). Handles
`customer.subscription.created/updated/deleted` → syncs `Subscription`
(plan/status/period end). Does not separately handle
`checkout.session.completed`: the Stripe customer↔user mapping is already
saved before checkout starts, and `customer.subscription.created` fires
with full status info anyway.

---

## Admin

All require `isAdmin`.

### `GET /api/admin/sources`
List all `Source` rows.

### `POST /api/admin/sources`
Body: `{ name, url, type: "RSS"|"API"|"SCRAPER", category?, trustScore?, scrapeConfig? }`.
`400` if `name`/`url`/`type` missing or `type`/`category` invalid; `409` if
`url` already exists (unique). Response `201`: created `Source`. Note: only
`RSS` actually gets scraped — `API`/`SCRAPER` have no working fetcher yet.

### `PATCH /api/admin/sources/:id`
Body: partial `Source` fields (e.g. `{ "active": false }` to disable). `404`
if the id doesn't exist, `409` on a duplicate `url`.

### `POST /api/admin/pipeline/run`
Forces a manual pipeline run (same orchestrator as the cron job). Response
`202`: `{ "pipelineRunId": string }`.

### `GET /api/admin/pipeline/runs`
Response `200`: list of `PipelineRun` with nested `ScrapeLog` summaries.
Query params: `?limit=20&status=FAILED`.

### `GET /api/admin/scrape-logs`
Failed-scrape inspection. Query params: `?sourceId=&success=false&limit=50`.

### `PATCH /api/admin/summaries/:id`
Body: `{ headline?, body?, whyItMatters?, tags? }`. `404` if the id doesn't
exist. Creates a new `Summary` version (version = current max across the
story + 1, not just `+1` on the edited row, so it stays correct even if
versions have drifted) with `editedByAdmin: true`,
`editedById: <admin user id>`. Response `200`: the new `Summary` row.

### `GET /api/admin/audit-logs`
Response `200`: list of `AdminAuditLog`, newest first.

---

## Internal / cron

Never called from the browser — protected by `Authorization: Bearer $CRON_SECRET`.

### `GET /api/cron/pipeline` (also accepts `POST` for manual triggering)
Triggers the full daily pipeline — fetch, dedup/cluster, rank, summarize,
build digest (Vercel Cron target, scheduled daily at 05:00 UTC in
`vercel.json`, with a 300-second maximum requiring Fluid Compute). Response `202`:
```json
{
  "pipelineRunId": "string",
  "fetch": { "succeeded": 8, "failed": 0, "articlesFetched": 500 },
  "cluster": { "embedded": 500, "failed": 0, "attachedToExisting": 12, "newStories": 340 },
  "rank": { "ranked": 352 },
  "summarize": { "summarized": 340, "failed": 0 },
  "digest": { "digestId": "string", "itemCount": 10 }
}
```

### `GET /api/cron/deliver` (also accepts `POST` for manual triggering)
Triggers digest delivery to every non-paused user whose *local* hour
(computed from their `timezone`) is at or past their `digestHour`. Only the
current UTC-dated edition is eligible. Previously successful deliveries are
skipped; failed deliveries can retry on a later invocation.
Scheduled hourly (`0 * * * *` in `.github/workflows/hourly-deliver.yml`;
requires repository secret `CRON_SECRET` and variable `PRODUCTION_URL`) — necessarily more frequent
than the once-daily pipeline cron, since it has to catch each user's local
delivery hour as it comes around. Sends each user their personal digest
(filtered to `favoriteCategories`, or the full digest if none are set) via
email, dedup'd against `DigestDelivery` so a user is never emailed twice for
the same digest. Response `200`:
```json
{ "delivered": 1, "failed": 0, "skipped": 3 }
```

~~`POST /api/webhooks/telegram`~~ — cut from scope (2026-07-27), will not be
built. See M6 in ROADMAP.md.

## Python transition (phase 1)
A separate FastAPI service implements only `GET /api/digests/latest` with the same
actual JSON shape, including `digestId`; 404 is `{ "error": "No digest available
yet" }`. Database errors return sanitized 503. The current TS route stays intact.
Contrary to older preview wording above, the existing implementation returns all
stored items publicly; Python preserves that contract. Homepage HTTP opt-in and
verification: [PYTHON_MIGRATION.md](PYTHON_MIGRATION.md).

### Digest generation policy (2026-09-08)
Read response shapes are unchanged. A rebuilt edition now contains exactly its
latest ranked selection (up to 10), rather than accumulating prior-run items.
Selection uses a soft cap of four per category; it fills remaining slots by score
when diversity is insufficient. An empty selection clears that edition's items.
Previously delivered email is not modified or resent by this operation.


Python phase 2a adds a local CLI only. It adds no HTTP endpoints and changes no
existing API contract or scheduler route. The TypeScript pipeline remains active.


Phases 2b–2c add manual Python AI/full-pipeline verification commands only. The
local orchestrator uses isolated JSON state, dependency-injected AI ports and no
production write repository. HTTP contracts, frontend behavior and production
scheduling are unchanged. See PYTHON_PIPELINE_VERIFICATION.md for evidence.


## Locale routing update (2026-09-09)

Web pages use `/tr` or `/en` prefixes, including `/en/dashboard`,
`/en/sign-in` and `/en/sign-up`. Unprefixed pages redirect to Turkish by default;
legacy `?lang=en` selects the English redirect and is removed from the URL.
An explicit locale prefix wins over a legacy query parameter. `/admin` and
`/en/admin` redirect to `/tr/admin`. Unsupported locale pages return 404.

API paths remain unprefixed. Their existing `lang` read-side query contracts are
transport parameters, not an alternative web-page locale mechanism. The optional
Python homepage HTTP request likewise keeps its existing `lang` contract.

`POST /api/billing/checkout` and `POST /api/billing/portal` additionally accept
`{ "locale": "tr" | "en" }`. Missing/invalid values default to `tr`. Checkout
success/cancel URLs and portal return URLs point to `/{locale}/dashboard`; no
arbitrary caller-supplied return URL is accepted.
