# Python migration — phases 0–3a

Initial decision date: 2026-09-07. Phase 2 scope revised by the founder on
2026-09-08. Phase 2a now adds manual read-only pipeline replay alongside the
original read API; no new pipeline HTTP endpoint is exposed.
The Vercel deployment, its environment and schedulers are not changed.

## 1. Hosting recommendation

**Recommend Render Starter for the eventual always-on API**, keeping Neon as the
existing database. Current advertised compute is $7/month for 512 MB / 0.5 CPU.
This is a small, predictable starting compute allocation, not a promise of total
cost: bandwidth, workspace/team features, taxes and future worker resources must
be checked at purchase. Choose an EU region near Neon. No plan is purchased here.
[Render's published instance comparison](https://render.com/articles/render-vs-railway),
[pricing](https://render.com/pricing).

| Option | Current cost/limits checked | Inactivity and suspension | Fit |
|---|---|---|---|
| Render Free | $0; 750 instance-hours/workspace/month | Sleeps after 15 idle minutes; next request automatically wakes it, typically about a minute. Quota exhaustion can suspend until next month; payment may be needed to extend usage. | Temporary demo only; cold starts exceed our 15-second frontend timeout. |
| Render Starter | $7/month compute, 512 MB / 0.5 CPU | Always-on compute rather than free-tier idle sleep; ordinary billing/usage limits still apply. | Recommended low-cost API. |
| Railway Free / Hobby | Trial $5 for 30 days, then Free $1/month credit, 0.5 GB per service; Hobby $5 minimum with $5 usage included, excess metered | Free credit is not guaranteed always-on capacity; configured usage limits shut down workloads. Optional Serverless sleep wakes on traffic but may return an initial 502; database traffic can prevent sleep. | Good alternative, but less predictable total cost and $1 cannot be assumed to cover a daily service. |
| Fly.io | Resource-based billing; credit card required for ordinary organizations, started and stopped Machines priced differently | Configurable autostart/autostop; do not assume permanent free compute or zero stopped-resource cost. | More infrastructure decisions than needed for this slice. |

Sources checked directly:
[Render Free limits](https://render.com/docs/free),
[Railway pricing](https://railway.com/pricing),
[Railway sleep/wake caveats](https://docs.railway.com/deployments/serverless),
[Railway hard usage limits](https://docs.railway.com/pricing/cost-control),
[Fly pricing](https://fly.io/docs/about/pricing/),
[Fly autostart/autostop](https://fly.io/docs/launch/autostop-autostart/).
Render Free's automatic wake is different from a pay-to-resume inactivity trap,
but its quota suspensions still make it unsuitable for reliable daily processing.
The proposed paid instance avoids that idle policy. Do not provision Render's
free Postgres: it expires after 30 days. Neon remains unchanged. This is not a
claim that any free service runs indefinitely without quota/billing constraints.
Later pipeline work should use a supervised worker/job with durable state, not
untracked FastAPI BackgroundTasks after an HTTP response. Worker sizing is phase 2.

## 2. ORM: SQLAlchemy 2.x + psycopg 3

Use SQLAlchemy's explicit declarative mappings with separate dataclass domain
objects and Pydantic HTTP response models. SQLModel combines SQLAlchemy and
Pydantic and is convenient for CRUD; here that coupling offers little benefit
because we deliberately separate persistence and transport. SQLAlchemy gives
explicit control of Prisma's quoted mixed-case tables/columns, PostgreSQL arrays,
existing enum columns, transaction isolation and latest-summary queries.
[SQLAlchemy mappings](https://docs.sqlalchemy.org/en/20/orm/declarative_tables.html),
[SQLModel overview](https://sqlmodel.tiangolo.com/).

Phase 1 uses synchronous SQLAlchemy in a synchronous FastAPI handler (threadpool),
with a small bounded pool. No async event loop is blocked by driver I/O. Read
projection models cover only required columns of Digest, DigestItem, Story,
Summary and RawArticle; they are not a complete schema definition. PostgreSQL
category values are read as strings without creating or altering enum types.
Four bounded query groups avoid per-item queries, and one REPEATABLE READ,
READ ONLY transaction provides a consistent snapshot. `sslmode=verify-full` uses
the bundled CA trust set (or an explicitly provided sslrootcert).

## 3. Migrations: Prisma now, Alembic after an explicit handoff

Prisma migrations remain the sole authority during transition. Python runs no
DDL and has no Alembic initialization, revision files or startup migrations.
Do not run metadata.create_all or autogenerate from these partial projections:
it could misidentify existing fields/tables as deletions.

Proposed phase-4 handoff: freeze schema writes, back up the database, map the full
schema including arrays/enums/constraints/defaults and Prisma-managed timestamps,
review an Alembic baseline against actual catalog metadata, and stamp only the
verified baseline without replaying DDL on existing tables. Test empty database
bootstrap independently. Then disable Prisma migration execution and designate
Alembic as the sole writer in CI/deploy. Review every generated revision; generated
migrations require human review, especially types and constraints.
[Alembic autogenerate limitations](https://alembic.sqlalchemy.org/en/latest/autogenerate.html).

## 4. Clerk auth decision (implementation deferred to protected routes)

Clerk now publishes a Python SDK/FastAPI example. Use `clerk-backend-api` through
a narrow AuthVerifier port, rather than implementing cryptography ourselves.
The current endpoint is public and has no token requirement; no unused auth SDK
or fake verifier is added in phase 1.
[Clerk's Python guide](https://clerk.com/articles/how-to-add-authentication-to-a-python-backend).

Concrete planned dependency: `authenticate_request(request,
AuthenticateRequestOptions(secret_key=..., authorized_parties=[exact frontend
origins], accepts_token=["session_token"]))`; verify the pinned SDK API/types
again when phase 3 starts. Use its JWKS retrieval/cache so key rotation works.
A configured public PEM (`jwt_key`) is a networkless alternative but requires an
explicit rotation procedure. Never derive a trusted JWKS URL from unverified
request claims or accept a user-supplied signing algorithm.

Require a Bearer session token on the cross-origin API. Keep Clerk sign-in UI in
Next.js; browser requests obtain a fresh token with getToken(), and future server
calls use Clerk's server auth helper then forward the token explicitly. Do not
forward cookies to an unrelated host. Verify RS256 signature, expiration/not-before,
configured issuer, and authorized-party origin; validate audience if configured.
Reject wrong token types, invalid/missing subject, wrong environment and pending
sessions. Map verified sub to the existing User.clerkId; admin/plan authorization
continues to come from trusted application data, never submitted user IDs.
[Clerk manual verification](https://clerk.com/docs/guides/sessions/manual-jwt-verification).

Phase-3 tests must cover bad signature/issuer/azp, expiry, key rotation, outage,
missing token, signed-in Free/Pro and admin denial. Phase 4 hardens revocation,
observability, CORS and rate limits. Keep CORS closed now: the homepage fetch is
server-to-server and needs no browser CORS permission. If browser API calls are
added later, allow only exact configured origins/headers. No wildcard credentials.

## 5. Repository and dependency boundaries

```text
backend/
  app/
    main.py                      composition root + lifespan + safe errors
    api/digest.py                HTTP contract / DTOs
    shared/database.py           engine configuration, read-only connections
    modules/digest/
      domain/models.py           dataclasses, framework-independent
      application/latest.py      repository Protocol + use case
      infrastructure/models.py   partial SQLAlchemy mappings
      infrastructure/repository.py
  tests/test_latest.py            fake repository + projection/HTTP tests
  tests/test_live.py              opt-in, real read-only Neon test
  requirements.lock              exact Python package versions
  pyproject.toml                 Python/test/lint settings
  README.md                      local setup and commands
src/                             existing Next.js frontend + temporary TS backend
prisma/                          sole migration authority for now
```

Infrastructure implements application ports. API depends on the application use
case; main.py injects the real repository, tests inject fakes. Python is 3.12;
FastAPI, SQLAlchemy, psycopg and test versions are locked after installation.
Future modules mirror scraper/parser/dedup/ranking/AI/notification/billing/user
boundaries when their phase is authorized. No empty implementations for them yet.

## Slice contract and coexistence

FastAPI exposes exactly GET /api/digests/latest. Latest edition by date descending;
items by rank ascending; highest summary version per story; missing summaries
use empty strings/tags; source URLs are preserved. JSON names match TypeScript:
digestId, date, rank, storyId, category, headline, summary, whyItMatters, tags,
sourceUrls. No edition returns 404 with `{ "error": "No digest available yet" }`.
An existing empty edition returns 200. DB failure returns a sanitized 503.

The current TS implementation returns all stored items and does not enforce a
signed-out preview limit despite old API prose saying so. Phase 1 preserves actual
behavior, including any oversized edition already in the DB, rather than silently
repairing it or changing the read contract. Equal-version ties previously had no
specified winner; Python adds an ID tie-break. Source URL order was unspecified;
Python orders by article ID. Parity comparison normalizes these ordering details.

The homepage calls getHomeDigest(). With server-only PYTHON_BACKEND_URL set it
fetches FastAPI over HTTP (no cache, 15-second timeout). Without it, it keeps the
existing getLatestDigest() implementation. No runtime failure silently switches
back to Prisma. This opt-in is required to preserve today's deployment while
proving the new route locally. Existing Next.js API routes, Clerk UI, Vercel
configuration, secrets and jobs remain untouched. Rollback is to unset that one
variable and redeploy when an eventual opt-in deployment is authorized.

## Revised phases 2–4 — founder authorization, 2026-09-08

The split removes duplicated cutover work from phase 2. Phase 4 already owns
production scheduler deployment, sole-writer coordination and migration ownership.
Phase 2 produces isolated, manually inspectable results, not authoritative writes.
No hosting purchase, production scheduler change or irreversible action is authorized.

| Phase | Scope | One-engineer planning estimate | Exit evidence |
|---|---|---|---|
| 2a | RSS normalization/fetch, cached embeddings, clustering and ranking in dry-run mode | 3–5 engineering days | Real feeds; exact same-input TS comparison and reconstruction of a recent production run |
| 2b | Embedding provider plus extract-then-summarize and translation adapters, bounded retries and validation; sample outputs in local artifacts | 2–4 days | Real OpenAI sample calls; grounded quality, token cost and latency comparison |
| 2c | Digest/category selection and complete manually triggered orchestration using isolated in-memory/local artifact outputs | 2–3 days | Full same-input TS/Python comparison, failure recovery and <300s real run |
| 3 | Remaining reads, user/preferences, email, admin/audit/editing, billing and Clerk verification | 10–15 days (unchanged) | Browser auth/admin tests, authorized email, Stripe test flow and route parity |
| 4 | Hardening, deployment, scheduler/sole-writer cutover, migration ownership and eventual TS retirement | 5–8 days plus 3–7 calendar observation days (unchanged) | Scheduled executions, backup/rollback rehearsal, one scheduler and one migration owner |

Phase 2 totals **7–12 engineering days**, not a promise of elapsed agent runtime.
2a's cost is mostly RSS/Atom field compatibility, repeatable-read snapshot reconstruction,
ordered clustering/tie equivalence and real differential tests. 2b must port fact grounding,
version handling, malformed-output rejection and translation recovery while measuring real
provider behavior. 2c still needs a unified input snapshot, transient writes/output versions,
category caps, retry boundaries and performance tuning even without production ownership.
The original 8–12 day range overlapped phase 4; removing that overlap does not eliminate
these porting/verification costs. Fresh embedding API work is assigned to 2b because
"no AI calls" in 2a means only stored vectors can be exercised live.

Phases 2a/2b/2c are authorized within these boundaries and independently reviewable.
2a is approved; 2b and 2c are implemented and live-verified under the same boundaries. No new approval is needed for reversible implementation details.
Phase 3 and production cutover remain separately scoped. Telegram remains excluded.

## Phase 2a implementation and evidence

- New domain/application/infrastructure modules under `backend/app/modules/`:
  scraper, parser, dedup and ranking; composition/snapshot code under `app/pipeline/`.
- Manual CLI only: `python -m app.pipeline.dry_run --output <local-directory>`.
  It has no apply/write option and uses the existing READ ONLY PostgreSQL engine,
  with an explicit READ ONLY transaction. It does not construct any OpenAI client.
- HTTPX (already locked) fetches sources concurrently with per-source failure isolation,
  a 20-second HTTP timeout and 5 MB decoded response cap. Standard-library XML parsing
  supports RSS/RDF/Atom; DTD/entity declarations are rejected. No new dependency.
- Preserve 150 selected articles, 0.83 cosine threshold, fixed existing centroids,
  union-find transitivity, source-category candidate vote and current ranking formula.
  Missing embeddings are explicitly deferred. No attempt to fix the known sabotage
  duplicate while measuring migration parity.
- `scripts/compare-python-pipeline.ts` invokes the real TS domain functions and installed
  rss-parser on the exact same local snapshot/feed bytes. No database or AI access.

Final live dry run: **7.661 seconds**, **15/15 feeds**, **926 articles** normalized.
Every normalized external ID, URL, title, body and timestamp matches TS on those bytes.
The original TS run fetched 928 articles earlier; feed churn explains the changing
count, rather than claiming today's feed snapshot is the original one.

Historical run `cmtsm5nwb0000ai5rgxr8wa7r` recorded 150 embedded articles,
111 new stories, 18 existing-story attachments and 124 ranked stories. The reconstructed
cohort reproduces all **111 stored groups and all 18 attachment destinations** exactly.
Python and TS scores match for **all 124 stories** at the same frozen clock. All stored
scores fall within scores computed at the original run's start/end times (recency decays
during the run). Compact evidence: `verification/phase-2a.json`.

Reconstruction limits: Story.pipelineRunId is not populated by the current writer,
so cohort attribution uses creation/fetch timestamps. Historical membership/embedding/
source-trust versions and ordering at equal publication times are not archived.
The successful comparison is evidence for this real cohort, not proof for every possible
historical run. The TS score oracle uses the same snapshot and a fixed clock. Future
same-input 2b/2c runs should capture inputs before execution to remove that ambiguity.
RSS malformed dates become null rather than JS Invalid Date, and unusual Atom XHTML
markup may differ; the 15 current feeds have zero field differences. Parser tests cover
invalid dates, fallback identity, namespaces and failure isolation.

No shared data, schema, API routes, frontend configuration, schedulers or hosting changed.
The 7.661s measurement excludes new embeddings and other AI stages and is **not** evidence
that the complete future Python pipeline fits 300s. That is the 2c exit criterion.

## Verification record

Completed locally against real Neon on 2026-09-07:

- Python tests: 6 fake/projection/HTTP tests + 1 opt-in live test, **7 passed**.
  Live test confirms transaction_read_only=on and repeatable-read isolation.
- TypeScript suite: **87 passed**, plus ESLint, typecheck and production build.
- Ruff check/format and git diff whitespace checks pass.
- Real FastAPI HTTP request: **200**, digest `cmtredbrc00kidv5rnskfke88`, date
  `2026-09-07`, **20 stored items**. First headline:
  `CDU, Sachsen-Anhalt'da Tarihi Bir Yenilgi Aldı`.
- The unchanged TS endpoint returned 200 and exactly matching data after sorting
  source URLs and resolving equal-rank ordering by story ID for comparison.
- Production-mode Next.js on `http://localhost:3001` with PYTHON_BACKEND_URL pointing
  to `http://127.0.0.1:8000` rendered the digest in the browser, including Turkish
  text, why-it-matters and source links. FastAPI access logs confirm the GET 200
  during that page load; the configured path has no Prisma fallback.
- PostgreSQL certificate verification initially failed because libpq lacked a
  root trust file. Explicit CA configuration fixed it; TLS was not weakened.
- Pinned Starlette emits test-only httpx/AnyIO deprecation warnings; these do not
  fail tests and need dependency compatibility review at the next update.

**Existing data issue:** 20 items persist in today's edition. The TS writer upserts
new items on reruns without removing older selections. This phase neither runs
that writer nor fixes/removes its data; enforce total edition size/idempotency in
phase 2. Returning 20 here proves parity rather than compliance with the top-10
product target.

Local services remain available for inspection. No Vercel settings, remote
services, schema, migrations, database roles or rows were changed in this phase.
The current TS backend remains in place. This historical phase-1 record predates
the revised phase-2 authorization above.


## Phases 2b–2c completion

The founder authorized uninterrupted work through 2c. AI ports/adapters, bounded
workers, strict response validation, local checkpoints and full digest assembly
are implemented. Three live samples and a full Python/TS same-input live run were
verified. Full Python elapsed time: 23.602s, 150 embeddings, 15 summaries, ten
translations, no failed stages. Details and qualification of quality/runtime claims
are in PYTHON_PIPELINE_VERIFICATION.md. Only phase 4 may change production ownership
or scheduling; no such change is included here.


## Phase 3 revised breakdown — authorized 2026-09-09

Stripe test-mode checkout, webhook sync and cancellation have been verified against
production-hosted TypeScript routes. Site-wide TR/EN routing is shipped. Phase 3
can now start; phase 4 still exclusively owns scheduler/authoritative-write cutover.

| Slice | Scope | Engineering estimate | Exit evidence |
|---|---|---|---|
| 3a | Public latest/date/story reads, localization, internal user/preferences/history reads | 2–3 days | Read-only Neon comparison against actual TS route/query output; no protected HTTP routes |
| 3b | Clerk verification, protected user/history, isolated preferences mutations | 3–4 days | Signature/issuer/azp/audience/session-type failures, JWKS rotation/outage, real session and Free/Pro comparisons |
| 3c | Email template, timezone due check, delivery dedup/retry | 2–3 days | Same-input selection/render parity, isolated delivery ledger and explicitly scoped test send |
| 3d | Admin reads, source CRUD, versioned editing/audit | 2–3 days | Admin denials, rollback/concurrency and reference transaction comparisons in isolated storage |
| 3e | Stripe Checkout/Portal/webhooks | 3–4 days | Signed real test-event replay, isolated subscription sync, cancellation and localized return-URL parity |

Total 12–17 engineering days, not elapsed agent runtime. This revises the earlier
10–15 estimate: localization adds read contracts, and each mutation slice needs a
non-authoritative verification setup. Proven Stripe behavior reduces uncertainty
but does not remove signature, idempotency, customer mapping and retry testing.

3a user reads remain internal application operations only. No user data HTTP
endpoint will be registered until 3b verifies Clerk. `GET /api/me` currently lazily
creates users in TS; Python 3a intentionally only finds existing `User.clerkId` rows.
Unknown users must not trigger provisioning in this read-only slice. Writes later
use isolated test storage; no shared Neon mutations, hosting purchases, production
scheduler changes or migration ownership changes are authorized by this phase.


## Phase 3a completion and limits (2026-09-09)

Public FastAPI reads now cover latest digest (TR/EN per-field fallback), dated
edition and story details. Dated/story routes deliberately remain Turkish, matching
actual TS HTTP handlers; only latest accepts `lang` today. Internal user/history
ports resolve existing `User.clerkId`, preferences, plan/status and filtered history.
No protected routes are registered. Missing users are not lazily created.

Live comparison against actual TS public handlers plus Prisma-backed history/user
queries: **16 public cases, 20 history queries (unfiltered + each of nine categories,
both languages), one existing user profile/preferences/subscription and personalized
English history — all matched**. Python public cases went through a real local
Uvicorn HTTP server. Both reference and Python database connections confirmed
`transaction_read_only=on`. No role, schema or data changes were made.

The historical 2026-09-07 digest still has 20 items with duplicate ranks. All fields
and story membership match, but equal-rank ordering is unspecified in TS. The
comparison normalizes `(rank, storyId)` ties and source ordering, not content or
membership. Python adds deterministic ties. Separate snapshots can drift during a
live production write; run the comparison during a quiet interval if that occurs.

A live test caught PostgreSQL enum-vs-varchar comparison failure; the read projection
now explicitly casts category to text for filtering and preference enum arrays to
text arrays. No enum/DDL ownership is introduced. Public malformed or impossible
dates return 400 in Python: TS currently normalizes some impossible dates through
JavaScript Date or raises an internal error. This is a deliberate validation improvement,
not an assertion of identical invalid-date behavior. Valid dates and missing-row
contracts preserve parity. Internal history limits enforce 1–50; HTTP user pagination
parsing remains a 3b concern.

Verification: **47 Python tests including three live tests, 142 TS tests, Ruff
check/format, ESLint, typecheck and production build passed**. The private oracle
contains user data, is mode 0600 outside the repo, and must not be committed.
`verification/phase-3a.json` contains aggregate evidence only. Reproduce using the
commands in backend/README.md. 3b–3e remain pending; no protected API, preferences
write, email send or Stripe mutation is implemented by this 3a commit.

## Phase 3b–3e implementation and verification (2026-09-09)

The remaining route ports are implemented for **explicit local sandbox use**.
The default `app.main:app` still exposes public reads only. The production Next.js
routes, Vercel configuration, GitHub schedules, Prisma migrations and Neon data are
unchanged. This is not Phase 4 cutover and is not a claim that Python is ready to
become the production writer.

### Authentication and storage boundary

`ClerkVerifier` uses installed `clerk-backend-api==7.0.0` for session signature
verification. A wrapper requires an exact configured issuer, authorized frontend
origin (`azp`), RS256, finite exp/nbf/iat, active session state, and user/session IDs.
Audience is enforced when configured; default Clerk sessions have no custom audience.
API keys, OAuth/M2M tokens, wrong issuers/origins/audiences, expired and pending
sessions are rejected. Verified `sub` maps only to existing `User.clerkId`; an
unknown user returns 409 rather than silently provisioning a production account.
Admin permission comes from the stored user, never request body/token metadata.

SDK source inspection found issuer verification disabled in the installed helper
and a nested JWKS retry path. The wrapper therefore checks issuer after signature
verification and retrieves keys from the configured issuer, with a five-second
HTTP timeout, five-minute per-instance cache, and five-second refresh cooldown.
It supports rotation, bounds unknown-key retries, and fails closed after cache
expiry during an outage (503). No token-controlled JWKS URL or issuer discovery.

**Live auth qualification:** a real existing Clerk session token minted through the
Backend API had a valid signature and expected issuer but omitted `azp`; the wrapper
correctly rejected it. No browser-issued success token was available to finish the
live positive authentication check. RSA-signed HTTP tests cover successful verified
access and all rejection cases. The actual browser-issued success check remains a
required cutover gate; no bypass was added to make this test pass.

Sources: [Clerk Python backend guide](https://clerk.com/articles/how-to-add-authentication-to-a-python-backend),
[official Python SDK](https://github.com/clerk/clerk-sdk-python), and the installed
7.0.0 authentication helper/types used during implementation.

All mutations use an injected `StateStore`. The only concrete mutation adapter is
`LocalState`, a private SQLite file outside the repository. It copies a read-only
Neon snapshot and serializes each state transaction with `BEGIN IMMEDIATE`.
It cannot connect to Postgres. It proves application behavior and rollback, not
Postgres write-adapter performance, constraints or distributed locking. The latter
must be implemented and validated in isolated Postgres before Phase 4 authorization.
Existing SQLAlchemy reads retain read-only transactions and TLS verification.

### Implemented slices

- **3b:** protected `/api/me`, category-filtered TR/EN history, Free/Pro preferences.
  Auth is a prerequisite to each protected endpoint. Unconfigured writes return 503.
- **3c:** exact Turkish email rendering, category filtering, UTC edition freshness,
  local-hour-at-or-after delivery, paused users, retry and atomic dedup claims.
  A five-minute local claim lease plus provider idempotency avoids concurrent sends.
  The concrete Resend adapter accepts only `delivered@resend.dev`, its simulator.
  Real subscriber sends are deliberately impossible with this adapter.
- **3d:** admin sources/read logs/audit, source create/update, versioned summary edits
  and atomic audit entries. Concurrent edits allocate distinct versions. A manual
  admin pipeline trigger runs the Phase 2 local pipeline with a 300-second deadline;
  its checkpoints/results stay under sandbox `pipelineStates`. It does not replace
  the snapshot's published digest or become a shared database writer.
- **3e:** test-key-only Stripe Checkout/Portal, localized return URLs, raw-body webhook
  verification and local subscription sync. Live-mode events/keys are rejected.
  Identical retries update the same local subscription rather than appending rows.

### Evidence and deliberate differences

A fresh read-only Neon snapshot contained one user, 15 sources, 305 summaries and
8 pipeline runs. Four admin read groups matched actual Prisma queries. Five
preference/source/summary mutation cases matched actual TS route handlers with
in-memory persistence; generated IDs/timestamps were normalized, not substantive
fields. The full email subject/HTML/text matched byte-for-byte, and all eight
Stripe status mappings matched TS. Only unspecified nested scrape-log ordering was
normalized in the admin read comparison. Snapshot files contain private data and
are kept mode 0600 outside Git; only aggregate evidence is committed.

Real external checks accepted one simulator email in the final successful run,
created Stripe test Checkout and Portal sessions, and replayed four existing real
Stripe test events through the signed Python HTTP endpoint into local storage.
Three update payloads had cancellation metadata; **all four still reported active**.
No terminal `canceled` event was available. That status is covered by unit tests,
not claimed as observed live here. Webhook replays were locally HMAC-signed with the
configured webhook secret; Stripe did not deliver to a newly registered endpoint.
This was session creation plus prior event replay, not a newly completed Checkout.
No existing Stripe subscription/customer was changed; disposable test customers and
uncompleted sessions were created by verification attempts. No charge was made.

The current Stripe SDK exposes Decimal values in parsed objects. The verification
harness uses the original response JSON for lossless webhook replay. SDK webhook
parsing uses `to_dict()`, its supported method, rather than the older recursive API.

Python deliberately rejects fractional integer fields with 400, bounds pagination,
and makes source/summary changes atomic with their audit entry. Malformed FastAPI
request shapes use framework 422 responses. These are validation/atomicity
improvements, not claims of identical TS behavior for every invalid request.

### Remaining Phase 4 gates / known limitations

- Successful browser-issued Clerk token against the real protected Python API.
- Isolated Postgres write-adapter/schema-constraint tests, then explicitly authorized
  production provisioning, delivery ledger and write ownership cutover.
- Real vendor webhook delivery to the eventual backend, a newly completed test
  checkout, and observed terminal cancellation; unit/replay evidence is not that.
- Stripe events still follow TS last-arrival semantics; out-of-order events can
  regress state. Durable event ordering/reconciliation is required before cutover.
- Local pipeline hard process death can leave its sandbox RUNNING marker; cancellation
  within the process is now recorded FAILED. Production lease/recovery is Phase 4.
- SQLite's JSON snapshot is a verification adapter, not a scalable production store.
  Sandbox delivery reads its frozen digest. Resend idempotency retention is finite;
  the local ledger must be retained across retries.
- No scheduling, hosting, production frontend API switch, or migration ownership
  change is included. No domain or sending-domain work was started.

See `verification/phase-3bcde.json` for aggregate checks and backend/README.md for
reproduction commands. These implementation slices are shipped with the above
live-verification gates explicitly outstanding, not labeled fully production-verified.
