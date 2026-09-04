# Roadmap

## M0 — Foundation ✅
Next.js + TS + Tailwind + shadcn init, Prisma + Postgres (Supabase) wired,
Clerk auth wired, repo/folder structure, CI lint/test/typecheck.

## M1 — Ingestion pipeline ✅
`Source` model + config, RSS fetcher, `RawArticle` storage, `ScrapeLog`,
manual admin-triggered run (no AI yet) — prove raw collection works
end-to-end.

## M2 — Dedup & clustering ✅
Embedding generation, similarity clustering into `Story`, basic importance
scoring (source trust + recency + cross-source count).

## M3 — AI summarization ✅
`AIProvider` abstraction + OpenAI implementation, structured fact extraction
→ Turkish headline/summary/why-it-matters/category/tags, `Summary` model
populated.

## M4 — Digest assembly + web dashboard ✅
`Digest`/`DigestItem` generation from ranked Stories, public + authenticated
digest views in the Next.js frontend, favorite-categories filter.

## M5 — Delivery: Email ✅
Daily email via a transactional provider, per-user timezone-aware send via
`/api/cron/deliver`, `DigestDelivery` tracking.

## M6 — Delivery: Telegram — **cut, will not be built**
Deliberately dropped (2026-07-27): no Telegram integration wanted. Left in
this doc only so the milestone numbering below stays stable; nothing in M6
should be started.

## M7 — Monetization — built, live verification pending real Stripe keys
Stripe Checkout + Billing Portal + webhook, Free/Pro gating (Pro = all
categories + earlier delivery). Code is done and unit-tested; see TODO.md
for what's still unverified.

## M8 — Admin panel ✅
Source management UI, force refresh, summary editing (versioned), pipeline
run/log viewer, audit log.

## M9 — Hardening & launch
Test coverage across modules, error alerting (Sentry), rate limiting, docs
finalized, soft launch to a small user group.

## Deferred to Emre (not blocking other milestones)
- **Sending domain for Resend**: buy a domain, verify it at
  resend.com/domains, update `EMAIL_FROM_ADDRESS`. Until then, email
  delivery only works for Resend's own account-owner address — a real,
  accepted limitation, not something to route around from this repo.

## Risks to keep in view

| Risk | Mitigation |
|---|---|
| Legal: scraping vs. German publisher copyright (Leistungsschutzrecht) | RSS/APIs first-class; scraping only with per-source legal review; store facts/short excerpts, never full article text |
| AI hallucination / factual drift | Ground summaries in extracted facts, cite source URLs, admin edit workflow |
| Duplicate/clustering false merges or misses | Tune embedding-similarity threshold against a labeled test set |
| OpenAI cost at scale | Cache summaries per story, batch prompts, track token cost per `PipelineRun` |
| Source feed breakage | `ScrapeLog` per source per run + alerting on repeated failures |
| Email deliverability | Transactional provider with SPF/DKIM/DMARC |
| Vercel function timeout on full pipeline | Chain pipeline steps via a queue (Inngest/QStash) rather than one function |
| GDPR / data privacy | Minimal PII, Clerk EU data residency, clear privacy policy |
| Turkish translation nuance | Prompt glossary for German proper nouns/political terms + admin edit backstop |
| Single AI provider dependency | Provider abstraction enables failover to Claude/Gemini |
