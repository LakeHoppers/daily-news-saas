# Sabotage story split — 2026-09-08

Read-only investigation of stories `cmtsm8cfw006sai5rtotgh4zv` (5 articles)
and `cmtsm8cqp006tai5rqzsn2vih` (3 articles), using stored Neon embeddings.
No articles, summaries, categories, or digest memberships were changed.

## Measured cause

The stories were created at 11:58:11.708Z and 11:58:12.097Z respectively,
0.389 seconds apart, with all eight articles fetched in the same ingestion batch.
This is a same-run split, not an existing-story 48-hour-window miss.

Across all 15 cross-cluster article pairs, cosine similarities ranged from
0.681351 to 0.773831. None reaches the current 0.83 union-find threshold.
The two cluster centroids have cosine similarity 0.824298. Current same-run
clustering compares article pairs, not cluster centroids, so that centroid score
does not create a bridge either. Short RSS bodies ranged from 119 to 221 characters;
the 4,000-character embedding truncation cannot explain this incident.

The content describes one arrest with differently emphasized details. Overlapping
publishers support that investigation but are not independently sufficient to merge
stories: publishers cover multiple separate events each day.

## Decision and next step

Do not lower the global threshold from one confirmed positive example. A value
at or below 0.773831 would bridge these groups, but there is no measured false-merge
rate for unrelated articles at that threshold. This task diagnoses the defect;
it does not claim the duplicate is fixed or modify the published edition.

Next, collect a labeled set including different arrests, updates to the same
arrest, and unrelated power-grid events. Evaluate a bounded second-stage event
verifier for borderline clusters (including cluster-level candidates), or a revised
embedding representation, against that set and the 300-second runtime budget.
Changing representation requires consistent handling of existing embeddings.

## Reproduce without AI calls or writes

```sh
npx tsx scripts/inspect-dedup.ts cmtsm8cfw006sai5rtotgh4zv cmtsm8cqp006tai5rqzsn2vih
```

The script loads configured database credentials normally without printing them,
then reports timestamps, input lengths, pair similarities and centroid similarity.
