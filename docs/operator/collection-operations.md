---
product: Hakken
documentation_type: operator runbook
feature_area: collection and saved-chain operations
audience: operators
source_repository: roninsatwork/Hakken
source_path: docs/operator/collection-operations.md
last_reviewed: '2026-10-26T15:21:11+00:00'
reviewed_against: current implementation
status: Current
---
# Data Collection Operations

> **Product:** Hakken · **Document type:** operator runbook · **Feature area:** collection and saved-chain operations
> **Reviewed:** 26 October 2026, 15:21:11 GMT (Europe/London)
> **Source path:** `docs/operator/collection-operations.md` · **Status:** Current


## Inspect before starting more work

This runbook explains how to interpret collection progress. It does not grant
permission to press Collect now, run an agent, increase spend or call a live
provider. Those operations can buy data and require authorization for their
actual scope. The weekly documentation task authorizes reading repository
source only. No live service or queue was inspected for this guide.

Start with the company's collection/run pages under
`/admin/companies/[id]/websites/runs` and the platform collection/cost area
under `/admin/websites`. Compare the selected company and website with the
run's objective, latest timeline entry, pending requests and recorded reason
for stopping. Read the most recent progress, not only the original start time.
A long-running collection can be healthy while its scheduled steps continue.

The DataForSEO Planner fills the request queue; the Collector sends requests
and records cost. These are plain-code roles, identified by role keys rather
than editable agent names. Plain code does not mean free collection: supplier
requests can incur charges. Planner Test mode queues work differently from
Live mode, so inspect the mode before proposing a new run.

## Interpret common states

- **Queued or waiting:** work exists but is not yet due, is waiting for a
  scheduled step, or has reached the day's spending ceiling. Check its reason
  and next timing before assuming a stall.
- **Sending:** the Collector works through multiple steps. A step time limit
  hands work on; it is not a requirement for somebody to press Run again.
- **Submitted:** a supplier task can be accepted while its result is still
  pending. This is different from ready data filed for screens to read.
- **Ready:** the request returned; dependent filing or summary work can still
  have its own progress. A planned collection line alone is not proof of
  successful acquisition.
- **Failed or uncertain:** read the exact cause. A provider send whose response
  was lost must not be blindly repeated: the first send may have been charged.

The Collector has a per-website collection allowance and a whole-platform
ceiling for a UK day. A request that would exceed its website allowance is
not bought and the remaining queue can continue; reaching the daily ceiling
holds further work. Expected-price checks guide admission, so these controls
are not a provider invoice reconciliation or a guarantee of a precise final
bill. Record actual returned costs separately from estimates.

## Recovery and provider boundaries

DataForSEO has a step watch plus an hourly fallback for overdue unsent work.
Other website collectors use a shared watched-chain service that records
progress and resumes a worker stopped by the platform. Repeated failures can
make a job run in smaller pieces, skip a failing piece with an explanation,
or close the chain. A completed run with a skip needs its summary read; it
must not be reported as complete source coverage.

Google Analytics quota waits are expected: work can wait for allowance and
continue within its nightly budget. Search Console has its own paced fill
and bounded busy waits. Bing has its own transport and weekly-data behavior.
Do not use one provider's quota or retention policy for all collectors.
Use the [Analytics](../developer/google-analytics.md),
[Search Console](../developer/search-console.md) and
[Bing](../developer/bing-webmaster.md) guides for those boundaries.

Before proposing a paid retry or a Google fill, identify the unfinished scope,
existing provider task/reference, allowance remaining and expected cost.
Do not clear queue rows, erase failure evidence or change limits just to make
a run look complete. Escalate an account refusal, missing credentials or
ambiguous send with its run/request identifiers and sanitized reason.
Never include provider secrets in a report.

For retained supplier data, reuse [DataForSEO Data Kept](./dataforseo-data-kept.md).
For implementation, see [Data Collection Operations](../developer/collection-operations.md).
Those retention descriptions and local tests are not evidence of a deployed
collection, live cutover completion or supplier acceptance.

## Insights uses the shared chain machinery

Current `collectionSteps` also dispatches the INSIGHTS chain to `insightsRunWorker.continueRun`. This is a separate analysis workflow using the same saved booking/watch mechanism, not an additional supplier purchase type. Its stage results and publication guards are documented in [Insights Findings](../developer/insights-findings.md#durable-refresh-recovery-and-source-generations). A section can keep earlier successful outputs while ending failed when any required stage remains unfinished. Do not use a saved weekly report alone as proof that the entire section refreshed. No chain was started, resumed or cancelled during this source review.
