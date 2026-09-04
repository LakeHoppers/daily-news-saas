# Bülten Almanya

Every morning, subscribers get a high-quality **Turkish** summary of the most important German news — not a translation, but a ranked, deduplicated, explained digest.

Built for Turkish speakers living in or following Germany: expats, professionals tracking the German economy, and anyone who wants "what happened in Germany yesterday and why it matters" in five minutes.

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
| Database | PostgreSQL (Supabase) via Prisma ORM |
| Auth | Clerk |
| Payments | Stripe |
| AI | OpenAI (provider-abstracted; Claude/Gemini pluggable) |
| Delivery | Email (WhatsApp possible later; Telegram cut from scope) |
| Scheduling | Vercel Cron |
| Deployment | Vercel |

> **Note:** this project runs on Next.js 16 and Prisma 7, both of which have breaking changes versus older tutorials/training data — e.g. `middleware.ts` is now `proxy.ts`, and Prisma Client requires an explicit driver adapter (`@prisma/adapter-pg`). See `node_modules/next/dist/docs/` and `.agents/skills/prisma-upgrade-v7/` for the authoritative current-version behavior before assuming older conventions.

## Getting started

```bash
npm install
```

Copy `.env` and fill in real values for `DATABASE_URL` (Supabase), Clerk keys, Stripe keys, and an AI provider key.

```bash
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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
npm run build    # production build
npm run lint     # eslint
```
