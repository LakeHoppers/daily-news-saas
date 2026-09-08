# News Daily Python read API

Read API: `GET /api/digests/latest`; phase 2a adds a manual dry-run CLI. See [migration decisions](../docs/PYTHON_MIGRATION.md).
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
