# News Daily Python read API

Read API: `GET /api/digests/latest?lang=tr|en`, `GET /api/digests/{date}`,
`GET /api/stories/{id}`. The default entrypoint exposes public reads only. Phase 3
protected/mutation routes require the explicit local sandbox described below.
See [migration decisions](../docs/PYTHON_MIGRATION.md).
Python 3.12 required. From the repository root:

```sh
python3.12 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.lock
backend/.venv/bin/python -m pytest -c backend/pyproject.toml backend/tests
backend/.venv/bin/ruff check backend/app backend/tests
```

Use the existing privately configured DATABASE_URL; never paste credentials into
terminal arguments. For local development only, load the root dotenv file without
printing it:

```sh
backend/.venv/bin/python -m dotenv -f .env run -- backend/.venv/bin/uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

In another terminal, enable the HTTP path only for that Next.js process:

```sh
PYTHON_BACKEND_URL=http://127.0.0.1:8000 npm run dev -- --port 3001
```

Without PYTHON_BACKEND_URL the existing TypeScript homepage behavior is retained.
When configured, backend failures surface instead of silently falling back. The
server fetch is uncached and has a 15-second timeout. Production URL must be HTTPS;
localhost HTTP is for local development only. Never set a localhost URL on Vercel.

Opt-in live read test (requires an existing nonempty Neon digest):

```sh
RUN_LIVE_TESTS=1 backend/.venv/bin/python -m dotenv -f .env run -- backend/.venv/bin/python -m pytest -c backend/pyproject.toml backend/tests -m live
```

No migrations or create_all calls. Connections and transactions are read-only,
use TLS verification, a small pool, connection/statement timeouts and repeatable
read snapshots. Before remote rollout, provision a dedicated SELECT-only role
separately; this phase does not modify database roles. The partial ORM metadata
must never be used to autogenerate schema changes.

Future host configuration (not deployed in this phase): repository root directory
`backend`, install `python -m pip install -r requirements.lock`, start
`uvicorn app.main:app --host 0.0.0.0 --port "$PORT"`, with private DATABASE_URL.
No persistent disk needed. Dependencies are pinned, including dev/test tools for
this proof of concept; split runtime/dev locks before production cutover.


## Phase 2a manual verification

From the repo root with the existing environment configured:

```sh
PYTHONPATH=backend backend/.venv/bin/python -m app.pipeline.dry_run --output /tmp/news-daily-phase2a
npx tsx scripts/compare-python-pipeline.ts /tmp/news-daily-phase2a
```

Optionally pass `--run-id <completed-run-id>` to replay a particular run. Artifacts
include feed XML, a database read snapshot and comparison JSON. Keep these local;
do not commit or place them in `public/`. There is no apply flag, write repository,
AI call, scheduler, new API route or migration. New RSS articles without stored
embeddings are not clustered in 2a; the clustering replay uses historical vectors.
See the migration document for exact parity results and reconstruction limitations.


Python phases 2b–2c now include real AI adapters and a complete manual pipeline
with local-only checkpoint output. Production still runs the TypeScript pipeline.
See docs/PYTHON_PIPELINE_VERIFICATION.md (from the repo root) for commands,
real same-input comparisons, cost/runtime evidence and recovery limitations.


## Phase 3a real read comparison

Run a local FastAPI server (example uses port 8013), then from the repo root:

```sh
npx tsx scripts/python-reads-reference.ts /private/tmp/news-daily-reads-reference.json
PYTHONPATH=backend backend/.venv/bin/python -m app.read_verification \
  --reference /private/tmp/news-daily-reads-reference.json --base-url http://127.0.0.1:8013
```

Use a fresh reference filename: the TS oracle refuses to overwrite files or save
inside the repository. This mode-0600 artifact contains private user information;
keep it local and outside public folders. Neither tool prints that payload. The
TS harness sets its connection read-only before importing Prisma; Python retains
its existing read-only engine/transaction guards. Comparison checks real public
HTTP responses, all category/locale history combinations and up to five existing
users without provisioning anyone. Only ordering unspecified by TS is normalized.

## Phase 3 protected API and isolated mutation verification

Production entrypoint `app.main:app` remains public-read-only. To explicitly run
the additional routes, create a private snapshot from the repo root and compare
actual TS handlers with Python's local transactions:

```sh
npx tsx scripts/python-phase3-snapshot.ts /private/tmp/news-daily-phase3.json
PHASE3_REFERENCE=/private/tmp/news-daily-phase3.json npx vitest run tests/unit/python-phase3-oracle.test.ts
cd backend
.venv/bin/python -m app.phase3_verification --snapshot /private/tmp/news-daily-phase3.json
# Optional real Stripe TEST sessions/event replay and Resend simulator only:
.venv/bin/python -m app.phase3_verification --snapshot /private/tmp/news-daily-phase3.json --external
# Manual, loopback-only API; never point production traffic or schedules here:
.venv/bin/python -m app.sandbox_server --snapshot /private/tmp/news-daily-phase3.json \
  --state /private/tmp/news-daily-phase3.sqlite --frontend-origin http://localhost:3012
```

Use fresh private paths. Both JSON files and SQLite contain copied user information;
keep them outside the repo. Reusing a SQLite path resumes its existing state and
does not re-import the snapshot. `DATABASE_URL` is read-only; SQLite is the only
mutation adapter. Local `.env` is loaded without printing it. The manual server
uses configured Clerk, Stripe test, Resend and cron secrets; it does not provision
or change any service configuration. It is a bearer-token API (no cookie auth or
cross-origin browser bridge). Use a browser-issued Clerk token with the exact
configured origin; never paste tokens into logs or commit them. Missing users are
not provisioned. Default `app.main:app` has no protected routes registered at all.

`--external` creates disposable test customers/uncompleted Checkout and Portal
sessions and sends to Resend's simulator. It reads prior Stripe test events and
locally signs/replays them into SQLite; it does not complete checkout, register a
webhook endpoint, charge money, or mutate an existing subscription. Missing historic
test events may mean the replay evidence must be collected again in a future test.
Real subscriber addresses are rejected before the Resend HTTP call.

New module structure retains application services with injected auth, state,
Stripe and email ports. Local read/mutation verification is not a replacement for
future Postgres write-adapter testing. See docs/PYTHON_MIGRATION.md for remaining
browser-auth and vendor-delivery verification gates and deliberate contract differences.
