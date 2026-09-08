# News Daily

**Live:** [daily-news-saas.vercel.app](https://daily-news-saas.vercel.app)

Every morning, subscribers get a high-quality **Turkish** (and, as of the v1 English toggle, **English**) summary of the most important German news — not a translation, but a ranked, deduplicated, explained digest.

Built for Turkish and English speakers living in or following Germany: expats, professionals tracking the German economy, and anyone who wants "what happened in Germany yesterday and why it matters" in five minutes.

## Docs

- [Architecture](docs/ARCHITECTURE.md) — clean-architecture module design, entities, data flow
- [Roadmap](docs/ROADMAP.md) — milestones from foundation to launch
- [TODO](docs/TODO.md) — current actionable checklist
- [API](docs/API.md) — route contracts

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router), TypeScript, Tailwind, shadcn/ui |
| Backend | Next.js Route Handlers |
| Database | PostgreSQL (Neon) via Prisma ORM |
| Auth | Clerk |
| Payments | Stripe |
| AI | OpenAI (provider-abstracted; Claude/Gemini pluggable) |
| Delivery | Email (WhatsApp possible later; Telegram cut from scope) |
| Scheduling | Vercel Cron (daily pipeline), GitHub Actions (hourly email) |
| Deployment | Vercel |

> **Note:** this project runs on Next.js 16 and Prisma 7, both of which have breaking changes versus older tutorials/training data — e.g. `middleware.ts` is now `proxy.ts`, and Prisma Client requires an explicit driver adapter (`@prisma/adapter-pg`). See `node_modules/next/dist/docs/` and `.agents/skills/prisma-upgrade-v7/` for the authoritative current-version behavior before assuming older conventions.

## Getting started

```bash
npm ci
cp .env.example .env
```

Fill in `.env` with development values for your PostgreSQL database, Clerk, Stripe, OpenAI, Resend, and cron secret. Obtain team credentials through a private secret-sharing channel. Never commit `.env` or paste credentials into issues or pull requests.

```bash
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Team workflow

Clone the repository, then follow the setup steps above. Source code, docs, tests, public assets, database migrations, and the npm lockfile belong in Git. Dependencies, generated files, build output, and local credentials are excluded by `.gitignore`.

Create a branch for each change and open a pull request into `main`. Before requesting review, run `npm test`, `npm run lint`, and `npm run typecheck`. Use a development database when working locally; migration commands modify the database selected by `DATABASE_URL`.

## Project structure

```
docs/          architecture, roadmap, todo, api docs
prisma/        schema.prisma, migrations
scripts/       one-off / operational scripts
src/
  app/         Next.js routes (pages + API route handlers)
  components/  shared UI (shadcn/ui-based)
  modules/     clean-architecture domain modules (scraper, parser, dedup,
               ranking, ai, notification, user) — each with
               domain/ (types+interfaces), application/ (use cases),
               infrastructure/ (concrete adapters)
  pipeline/    orchestrates the modules into the daily run
  shared/      cross-cutting: Prisma client, AI provider interface
  proxy.ts     Next.js 16 request proxy (auth gate via Clerk)
tests/         unit + integration tests
```

## Scripts

```bash
npm run dev      # start dev server
npm run build    # generate Prisma Client + production build
npm run lint     # eslint
```

Deployed to Vercel at [daily-news-saas.vercel.app](https://daily-news-saas.vercel.app) — daily pipeline via Vercel Cron, hourly delivery via GitHub Actions. Setup history and runtime measurements: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) (note: some of that doc's "pending activation" language predates the actual production deploy).

Python migration phase 0–1: [decisions and verified slice](docs/PYTHON_MIGRATION.md), [backend setup](backend/README.md). The homepage opts into FastAPI with server-only `PYTHON_BACKEND_URL`; unset preserves the existing deployment.
