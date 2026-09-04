# Architecture

## Overview

Bülten Almanya is a scheduled ETL + AI pipeline behind a Next.js app. The core
loop runs on a cron trigger once a day; the web/app layer serves the results
of the last run plus user account management. Nothing here is real-time.

```
                        Vercel Cron (daily)
                                │
                                ▼
                    Pipeline Orchestrator (src/pipeline)
        ┌───────────────┬────────┬────────┬───────────────┐
        ▼               ▼        ▼        ▼               ▼
   Scraper  ──────▶  Parser ──▶ Dedup ─▶ Ranking ──▶ Summarizer/Translator
   module          module    /Cluster   Engine        (AI provider)
                                                              │
                                                              ▼
                                                     Digest Builder
                                                              │
                                                              ▼
                                          Notification Service
                                          (Email — Telegram cut from scope)
                                                              │
                                                              ▼
                                                  PostgreSQL (Prisma)
                                                              ▲
        ┌────────────────────────────────────────────────────┘
        ▼
  Web Dashboard (Next.js)  ◀────▶  User Service (Clerk + Stripe)
```

## Clean architecture layering

Each module is organized in three layers, independent of framework:

```
src/
  modules/
    scraper/
      domain/          SourceConfig, RawArticle types + interfaces
      application/      FetchArticlesUseCase
      infrastructure/    RssFetcher, HttpScraper, per-source adapters
    parser/
      domain/           ParsedArticle
      application/       NormalizeArticleUseCase
    dedup/
      domain/            ArticleCluster
      application/        ClusterArticlesUseCase (embedding similarity)
    ranking/
      domain/            RankedStory
      application/        RankStoriesUseCase (scoring rules)
    ai/
      summarizer/
        application/       SummarizeStoryUseCase (extract facts, then
                            summarize; provider-agnostic via DI)
        infrastructure/     PrismaSummarizerRepository
      providers/          OpenAIEmbedder, OpenAIFactExtractor, OpenAISummarizer
                          (Claude/Gemini equivalents are drop-in later)
    digest/
      domain/            DigestView types, startOfUtcDay
      application/        BuildDigestUseCase (ranks unused summarized
                          stories into the day's Digest/DigestItem rows)
      infrastructure/     PrismaDigestRepository (write side),
                          digest-view.ts (read side: latest/by-date/history,
                          used directly by API routes and Server Components)
    notification/
      domain/            due-check.ts (timezone-aware "is this user due
                          right now"), email-template.ts (pure, HTML-escaped
                          Turkish digest email builder)
      application/        SendDigestUseCase (finds due users, sends via
                          EmailSender, records DigestDelivery, isolates
                          per-user failures)
      infrastructure/     ResendEmailSender, PrismaNotificationRepository,
                          PrismaDigestReader (glues to the digest module's
                          read side — see digest/ above)
    billing/
      domain/            status-mapping.ts (Stripe status → our
                          SubscriptionStatus/SubscriptionPlan enums —
                          checked the installed `stripe` v22 SDK's actual
                          types rather than assuming; current_period_end
                          lives on subscription.items, not the subscription
                          itself, in this API version), plan-limits.ts
                          (Free/Pro gating rules)
      application/        CreateCheckoutSessionUseCase,
                          CreatePortalSessionUseCase, SyncSubscriptionUseCase
      infrastructure/     RealStripeGateway (wraps the `stripe` SDK),
                          PrismaBillingRepository
    user/                (unused so far — Clerk→User sync ended up as
                          `getOrCreateCurrentUser()` in shared/api-guards.ts
                          instead of a dedicated module; revisit if this
                          module grows real content)
  pipeline/
    orchestrator.ts       wires use cases together, called by cron route
  shared/
    ai-provider.interface.ts   AIProvider abstraction (swap OpenAI/Claude/Gemini)
    prisma.ts                  Prisma client singleton (driver-adapter based)
```

**Dependency injection**: use cases receive their infrastructure
implementations via constructor/factory injection rather than importing
concrete adapters directly, so each use case can be tested with fakes/mocks.
A module's `application` layer is the only thing other modules or routes are
allowed to import — nothing reaches into another module's `infrastructure`.

**AI provider abstraction** (`src/shared/ai-provider.interface.ts`) — split
into narrow, independently-injectable interfaces (interface segregation)
rather than one fat `AIProvider`, so e.g. the dedup module only depends on
`Embedder` and never sees summarization concerns:

```ts
interface Embedder {
  embed(text: string): Promise<number[]>; // for dedup/clustering
}
interface FactExtractor {
  extractFacts(input: ExtractFactsInput): Promise<ExtractFactsOutput>;
}
interface Summarizer {
  summarize(input: SummarizeInput): Promise<SummarizeOutput>;
}
interface AIProvider extends Embedder, Summarizer, FactExtractor { ... }
```

OpenAI ships first (`OpenAIEmbedder`, `OpenAIFactExtractor`,
`OpenAISummarizer`); Claude/Gemini are drop-in implementations of the same
interfaces, selected via the `AI_PROVIDER` env var.

**Extract-then-summarize, not one shot**: `SummarizeStoryUseCase` calls
`FactExtractor` first (grounds output strictly in the given article
snippets, merges duplicate facts, never invents anything) and only then
calls `Summarizer` with the extracted facts — not the raw articles. This
two-step split exists specifically to reduce hallucination risk in the
Turkish output, and matches "detect duplicates / extract facts / summarize"
being listed as distinct AI responsibilities in the product spec.

## Entities

| Entity | Purpose |
|---|---|
| User | App user (synced from Clerk) |
| UserPreference | Favorite categories, digest time, channel opt-ins |
| Subscription | Stripe subscription state (free/paid tier) |
| Source | A configured news source (RSS/API/scraper config, trust score) |
| RawArticle | Unprocessed fetched item from a source |
| Story | A deduplicated real-world event, grouping multiple RawArticles |
| Summary | Turkish AI output for a Story (headline, body, why-it-matters, tags), versioned |
| Digest | A generated daily edition (date, ranked Stories) |
| DigestItem | Join: Story ↔ Digest with rank |
| DigestDelivery | Record of a Digest sent to a User via a Channel |
| NotificationChannel | Alternate delivery address binding (unused in practice — delivery goes straight to `User.email`; Telegram cut from scope) |
| ScrapeLog | Per-source, per-run success/failure log |
| PipelineRun | Metadata for one end-to-end daily run |
| AdminAuditLog | Records admin actions |

Full field-level definitions live in [`prisma/schema.prisma`](../prisma/schema.prisma).

## Data flow (one daily run)

1. **Scraper** fetches `RawArticle` rows per active `Source` (RSS first-class;
   scraping only where legally reviewed).
2. **Parser** normalizes raw HTML/feed content into clean text + metadata.
3. **Dedup** embeds articles and clusters near-duplicates into a `Story`.
4. **Ranking** scores each `Story` (source trust, recency, cross-source
   corroboration) into `importanceScore`.
5. **AI summarizer** extracts facts and generates the Turkish `Summary`
   (headline, 2-3 paragraph body, why-it-matters, category, tags) via the
   active `AIProvider`.
6. **Digest builder** assembles the day's `Digest` from top-ranked `Story`
   rows.
7. **Notification service** delivers the `Digest` to each `User` per their
   `NotificationChannel` and `UserPreference` (favorite categories, digest
   hour, timezone).

## Runtime note: Next.js 16 / Prisma 7

This project was scaffolded against **Next.js 16.2** and **Prisma 7.9**,
both newer than most training data / tutorials:

- `middleware.ts` → **`proxy.ts`** (function renamed `proxy`, same
  semantics). See `src/proxy.ts`.
- Prisma Client requires an explicit **driver adapter**
  (`@prisma/adapter-pg` + `pg`) — there is no bundled query-engine binary in
  the default `prisma-client` generator path. See `src/shared/prisma.ts`.
- Datasource `url` lives in `prisma.config.ts`, not in `schema.prisma`'s
  `datasource` block. The installed version's config type only supports a
  single `url` (no `directUrl`) — see the comment in `prisma.config.ts` for
  how we handle Supabase's pooled-vs-direct connection split as a result.
- `prisma migrate dev` no longer auto-runs `generate` or seed — run them
  explicitly.

Before changing anything Next.js- or Prisma-specific, check
`node_modules/next/dist/docs/` and `.agents/skills/prisma-*/` — they ship
with the exact installed version and are more reliable than memorized
conventions.
