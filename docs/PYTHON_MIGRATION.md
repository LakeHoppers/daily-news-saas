# Python migration — phases 0–1

Decision date: 2026-09-07. Scope: design plus one read-only vertical slice.
No pipeline, user, admin, billing or delivery endpoint is ported in this phase.
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

## Proposed phases 2–4 — not authorized by this document

| Phase | Scope | Rough effort for one engineer | Exit evidence |
|---|---|---|---|
| 2 | Port ingestion, normalization, embeddings/clustering, ranking, extraction/summarization and digest writes; retries, bounded concurrency, durable job/run ownership and one scheduler | Large: 8–12 engineering days | Real RSS/AI run, top-10/content parity, failure recovery, idempotent reruns, measured cost/runtime; never run two production writers |
| 3 | Remaining public/history reads, user/preferences, email, admin/audit/editing and Stripe routes; Clerk verification before any protected route is exposed | Large: 10–15 days | Browser auth/admin tests, real authorized email, Stripe test Checkout→webhook→gating, contract parity and route-by-route rollback |
| 4 | Auth/security hardening, rate limits/alerts, operational tests, deployment and scheduler cutover, migration ownership handoff, remove TS backend only after observation | Medium: 5–8 days plus 3–7 calendar days observing scheduled runs | Genuine scheduled executions, no duplicates, backup/restore and rollback rehearsal, one migration owner and one scheduler |

Estimates include tests/documentation but depend on access, domain/Stripe setup
and product decisions; they are planning ranges, not commitments. Telegram stays
out of scope. Review these phases together before implementing any of them.

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
The current TS backend remains in place; phases 2–4 await separate authorization.
