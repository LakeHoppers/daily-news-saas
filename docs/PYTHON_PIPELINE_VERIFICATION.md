# Python phases 2b–2c verification — 2026-09-08

Both phases are complete as manually triggered, isolated-output migration slices.
There is no production cutover, shared-table write adapter, scheduling change,
new endpoint, hosting purchase or email delivery. Raw feeds/AI outputs/checkpoints
remain under local temporary directories; only compact evidence is committed.

## 2b: real provider comparison

Ported Embedder, FactExtractor, Summarizer and Translator protocols with a shared
HTTPX OpenAI adapter. Models remain text-embedding-3-small (256 dimensions) and
gpt-4o-mini. Prompts began as exact TS ports; real QA led to Python-only additional
instructions preserving actor/action/object relationships, attribution, uncertainty,
and avoiding invented government positions. The deployed TS prompts are untouched.

Used three actual published stories (Houthi attacks, Canada/Bombardier tariffs,
PISA results), fetched from Neon in a READ ONLY transaction. Both implementations
made independent real OpenAI calls on the same stored snippets:

| Measurement | Python | TypeScript |
|---|---:|---:|
| Successful embeddings / summaries / translations | 3 / 3 / 3 | 3 / 3 / 3 |
| Elapsed seconds | 8.265 | 7.041 |
| Estimated USD | 0.00192462 | 0.00192222 |

Review traced extracted facts and the Turkish/English text to the supplied snippets.
The first sample mistranslated an attack on a prison as action to imprison people.
A targeted repeat using the exact original Turkish text, after clarifying the
translation prompt, correctly retains an alleged attack on a prison. These are
sample-level checks, not an automated guarantee against semantic errors. Both
implementations still sometimes generate broad implications or fewer than the
requested 2–3 paragraphs. One full-run Python headline retained the English word
"Setback"; editorial polish and larger labeled quality evaluation remain follow-ups
before launching Python-generated content. None of these outputs was published.

Validation rejects blank/non-string text, malformed facts and nonfinite/wrong-size/
zero embeddings. Invalid category falls back as in TS. Successful extraction is
cached within the immutable local job so a summary retry needn't extract again.
HTTP calls have a 30s deadline and one bounded retry for transport/429/5xx errors;
nonretryable HTTP errors and malformed output remain isolated item failures.
Embedding workers: 15. Sequential extract→summarize workers: 5. Translation workers: 5.

## 2c: full real run

Python fetched 15 live RSS feeds (928 items), normalized/deduplicated source IDs,
embedded the newest 150, formed **139 clusters**, ranked them, summarized the top
15, selected ten with the existing soft category cap, and translated all ten.
Every output went into local memory/checkpoint JSON. Zero stage failures.

**23.602 seconds end to end**, including source-config read and fresh RSS fetch;
**190 API calls**, estimated **$0.00607123**. This is comfortably below 300 seconds.
An independent run of the actual TS application use cases with in-memory repository
adapters and real OpenAI calls on the identical saved feed input took **22.017s**
(excludes downloading the same feed bytes again), **190 calls**, **$0.00607558**.

- Identical normalized input, cluster memberships, importance scores and all ten
  selected story IDs in rank order.
- One AI category differed: Novartis drug-development story ECONOMY in Python vs
  BUSINESS in TS. Both are plausible; the deterministic selection result was unchanged.
- Python digest: Politics 4, Economy 3, Society 2, Business 1.
- Input SHA-256 and numeric comparisons: `verification/phase-2bc.json`.

The isolated initial state is empty in BOTH languages. This proves the complete
pipeline on identical live input, not performance against the production backlog,
networked persistence or hosted worker resources. The earlier 2a replay separately
verified existing-story attachments against production. The 23.602s result is not
a promise for a future host or rate-limited run; production cutover remains phase 4.

## Local recovery and boundaries

The manual runner enforces a 300s overall deadline, checkpoints by atomic local
file replacement and propagates cancellation rather than converting it into an
item failure. `--resume` resumes that same immutable input; it does not start a
new edition. Completed runs are no-ops. Failed embeddings and failed summaries
remain eligible on resume, successful summaries aren't duplicated, and the digest
set is replaced when a partial run recovers. Prior published incomplete translations
are retried independently (five-record budget, latest version only).

This is local-process recovery, not a distributed job queue. Do not run concurrent
processes against the same output directory. The state should not be edited manually.
A failed source in the saved feed snapshot requires a new run with fresh input;
resuming does not secretly replace that snapshot. No apply/write-to-Neon flag exists.

## Reproduce

From the repository root with the existing private environment configured:

```sh
PYTHONPATH=backend backend/.venv/bin/python -m app.pipeline.ai_sample --output /tmp/news-daily-sample-new
npx tsx scripts/python-ai-sample-reference.ts /tmp/news-daily-sample-new

PYTHONPATH=backend backend/.venv/bin/python -m app.pipeline.full_run --output /tmp/news-daily-full-new
npx tsx scripts/python-full-reference.ts /tmp/news-daily-full-new
PYTHONPATH=backend backend/.venv/bin/python -m app.pipeline.compare --python /tmp/news-daily-full-new --typescript /tmp/news-daily-full-new
```

`full_run --input <input.json> --output <fresh-directory>` reuses captured input.
`full_run --resume --output <existing-directory>` resumes locally. Full/sample
commands make real billable OpenAI calls; compare is offline. No key is printed.

Costs use returned token usage and published standard prices checked 2026-09-08:
[GPT-4o-mini](https://developers.openai.com/api/docs/models/gpt-4o-mini)
($0.15/M input, $0.075/M cached input, $0.60/M output),
[text-embedding-3-small](https://developers.openai.com/api/docs/models/text-embedding-3-small)
($0.02/M input). Estimates are not invoice reconciliation; failed requests without
usage metadata cannot be priced from these artifacts.

## Final verification gates

118 TypeScript tests and 31 Python tests (including both read-only live tests)
passed. Ruff check/format, ESLint, typecheck and production build passed. A copied
completed local checkpoint resumed in 0.057s with zero further OpenAI calls.
