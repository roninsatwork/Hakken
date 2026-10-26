---
product: Hakken
documentation_type: developer guide
feature_area: data collection operations
audience: platform operators and developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/collection-operations.md
last_reviewed: '2026-10-26T09:02:17+00:00'
reviewed_against: current implementation
status: Current
---
# Data Collection Operations

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Data collection operations
> **Reviewed:** 26 October 2026, 09:02:17 GMT (Europe/London)
> **Source path:** `docs/developer/collection-operations.md` · **Status:** Current

## Separate planning, buying and filing

The supplier pipeline has several durable stages. `seoAgentRuns.ts` dispatches
the DATAFORSEO_PLANNER and DATAFORSEO_COLLECTOR roles by `systemKey`, not by
an agent's editable name. The Planner opens/expands due company collection
cycles without itself sending purchases. The Collector claims and sends
queued supplier operations. Ready results are filed into domain-specific
records and maintained summaries read by customer screens.

`seoCollection.ts` expands cycles; `seoTools.ts` opens cycles and exposes
supporting collection operations; `seoCollectionQueue.ts` owns atomic claim
and settlement; `seoCollectionActions.ts` sends batches;
`seoCollectorRun.ts` carries a continuous collector run through scheduled
steps. Do not collapse these into one request-response assumption in a new
screen or tool. A run can have finished sending while provider tasks remain
submitted and later filing continues.

This is an internal developer/operator feature. An artificial customer guide
would suggest ordinary company members administer paid queues. Customer
website context is covered in [Websites And Visibility](../end-user/websites-and-visibility.md);
operators have a concise [runbook](../operator/collection-operations.md).
Detailed supplier retention already lives in
[DataForSEO Data Kept](../operator/dataforseo-data-kept.md) and should not be
duplicated here as another competing storage policy.

## Scope, configuration and authorizations

Platform setup and manual collection entry points use the administration
boundaries in their owning modules. Client report reads are tenant-scoped and
private tracked lists must be read through `holdLists`. Shared supplier
purchases can be reused without exposing another company's chosen questions
or searches. Any new operational action must use the existing role/builder
and company validation rather than trust the route's company ID.

`dataForSeoRest.readDataForSeoCredentials` reads `DATAFORSEO_LOGIN` and
`DATAFORSEO_PASSWORD`. `DATAFORSEO_SANDBOX` chooses the configured sandbox
path. Its existence does not authorize a call, establish a live account or
prove every sandbox operation has identical commercial coverage.
`CONVEX_SITE_URL` is used for provider callback construction. Keep values out
of guide text, logs and copied error reports; list names only.

Planner mode is behavior, not a cosmetic label. The source distinguishes
Test, which queues work broadly, from Live, which respects what is due by
company cadence. Do not infer “free” from the word Test. The Collector can
still send queued work to its configured supplier. Both role jobs are plain
code and do not need a model call; supplier acquisition still costs money.

## Queue admission and atomic claims

`seoCollectionPolicy.ts` centralizes sizing and timing. Expansion processes
100 company websites per mutation, supplier batch size is 100, live calls
have bounded concurrency of five, and rows are spaced by 250 milliseconds
at enqueue time. These are current implementation choices, not a newly
verified statement of every provider endpoint's present limits.

`claimSeoBatch` selects due work for one operation because one provider call
targets one endpoint. Claiming and marking happen in a single mutation so two
workers cannot independently admit the same chargeable queue row. The
returned result includes the next due time and whether the daily spending
ceiling held work back. A row not yet due is not equivalent to an empty queue.

`seoCollectionLimits.holdToLimits` reads the Collector's per-website
`maxCostUsd` and daily `maxDailyCostUsd`. It estimates operation price before
admission. The former is per website within a collection, not a universal
run allowance; a request outside a collection has no collection budget but
still sees the daily check. Zero/unset follows the platform's no-cap
convention. Actual provider costs and estimates remain different, and
admission code has bounded reads and forward-progress behavior. Do not
advertise its settings as a hard financial guarantee.

## One run across action boundaries

`collectStep` sends while the queue permits work, then hands on instead of
ending merely because one action's allotted step is over.
`SEO_COLLECTOR_STEP_MS` is five minutes, leaving room for a request already
in flight and its result. `continueCollecting` starts subsequent pieces
under the same run. `bookCollectorStep` also books a watch and
`cancelCollectorWatch` removes the old watch when handoff or completion is
known.

`SEO_COLLECTOR_WATCH_MS` is ten and a half minutes, beyond the normal action
life. `SEO_COLLECTOR_QUIET_MS` is three minutes; a late watch checks real run
movement before starting more work. `lastMoved` in `roleRuns.ts` judges
activity by recorded progress rather than only `startedAt`. A run whose
first step started long ago can therefore still be healthy.

Near-future requests can keep the continuous run alive or book a later step,
using the policy's sleep and wait-ahead boundaries. Repeated supplier
“not now” replies use bounded pauses and a bounded count of refused steps.
An account refusal or the daily ceiling is recorded as something that needs
attention or a later allowance, rather than hidden behind a perpetual
spinner. The hourly overdue-work check is a fallback, not the ordinary way
each batch is initiated.

## Posted work, retries and settlement

Posting a supplier task, obtaining its task identifier, obtaining its final
answer and filing that answer are separate events. A lost response after a
request began is materially different from work never posted. Preserve
`SEND_UNCERTAIN` and provider task/tag recovery evidence instead of resetting
such a row to an apparently untouched state.

`settleSeoResult` guards already READY/FAILED rows so an hourly poll and a
provider notification reaching the same task do not independently repeat
settlement. Successful results with stored content schedule filing.
`markSeoPinged` can use the provider task ID or the echoed request tag to
recognize a late result, including cases whose earlier result wait had been
closed. No unconditional exactly-once external-delivery guarantee follows
from these local guards.

`seoSupplierRetry.ts` specifically handles supplier refusals known to carry
no charge. It requeues later within the Collector's run using the retry
waits in policy, rather than treating every financial/transport failure as
safe to purchase again. The distinction matters: a retryable upstream
refusal is not the same as an ambiguous paid POST. Keep provider evidence,
request identity and settlement status attached through every retry.

## Shared watched chains for website collectors

`collectionSteps.ts` is another reliability mechanism, used by website
collectors such as Google Analytics and Search Console. It is distinct from
the DataForSEO Collector's per-step watch. A chain records its current job
arguments/place, booking number and one closing operation. `bookStep`,
`notePlace` and the watch make a platform-stopped worker recoverable without
requiring somebody to press a visible retry button.

The shared service sets an action-life constant of ten minutes and a watch
threshold of twelve. A watch looks at scheduled-function state and uses
booking numbers to prevent an older superseded step from running twice.
The second try at the same place is careful; the third skips that piece with
an explanation. Past eight resumes the chain runs its closing rather than
continuing indefinitely. Those are incomplete-data conditions to expose in
run evidence, not success claims to conceal from an operator.

Collectors must keep progress and closing behavior consistent: a worker can
die between a provider answer and a write, or between a write and booking
its continuation. Preserve idempotent writes, target revalidation and the
recorded place. Adding a timer without these state checks does not make
chargeable or large work resumable.

## Diagnosis and verification boundaries

Use the company run pages under
`/admin/companies/[id]/websites/runs` and global collection/cost pages under
`/admin/websites` to connect a reported symptom to a cycle, request, supplier
task and role run. Read current progress and the recorded stopping reason.
A scheduled retry, exhausted allowance, provider refusal, submitted task,
failed filing and stale summary require different responses.

Keep provider-specific policies separate. Analytics persists quota
observations and can wait within its nightly budget; Search Console's first
history fill has paced requests and bounded busy waits; Bing collects weekly
lists and cached live details. Their guides describe those modules. The
shared role-run layer does not replace each provider's source limits,
authorization or retention policy.

Relevant tests include `seoCollectionQueue.test.ts`,
`seoCollectionProgress.test.ts`, `seoIdempotency.test.ts`,
`seoCollectionMoney.test.ts`, `seoAgentRuns.test.ts` and watched-chain tests.
A test exercising claim/recovery should assert provider call counts and final
stored state, not merely a timer being advanced. Follow the repository's
real-deadline/fixed-clock helpers and never add a per-test timeout to mask a
slow or stranded job.

This documentation pass inspected source and selected declarations without
running collectors, calling suppliers, probing quotas, modifying schedules,
backfilling data or executing application tests. A local source/test record
is not acceptance of a deployed callback or real charge behavior. Any future
operational recovery must be separately authorized for the precise provider,
scope and expected spend, and must preserve existing task evidence.
