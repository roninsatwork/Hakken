---
product: Hakken
documentation_type: developer guide
feature_area: Insights findings and analysis foundation
audience: developers and platform operators
source_repository: roninsatwork/Hakken
source_path: docs/developer/insights-findings.md
last_reviewed: '2026-10-26T15:13:08+00:00'
reviewed_against: current implementation
status: Current
---
# Insights Findings

> **Product:** Hakken · **Document type:** developer guide · **Feature area:** Insights findings and analysis foundation
> **Reviewed:** 26 October 2026, 15:13:08 GMT (Europe/London)
> **Source path:** `docs/developer/insights-findings.md` · **Status:** Current



## Reviewed scope and entry points

Insights findings are implemented by the route family
`src/app/(dashboard)/app/insights/findings/`, current-week reader routes,
`convex/insightsReads.ts`, `insightsTeam.ts`, `insightsRun.ts`,
`insightsRunSteps.ts`, `insightsReading.ts` and the pure fact/editor helpers.
This guide covers the core finding pipeline and action handoff. It does not
claim a complete review of report exports, experiments, drafts, measurement,
leaderboards, competing-page decisions or every analyst specialist; those
remain explicit inventory subareas.

The section's `_components/useInsights.ts` defines menu groups and
`INSIGHTS_PAGES`. Current records mark many pages built, but that UI flag is
not evidence that each source is connected or a particular deployment has
accepted a full weekly run. The [user guide](../end-user/insights-findings.md)
explains findings without promising completion of the broader intent in
[PRODUCT.md](../../PRODUCT.md).

## Reader authorization and projection

`insightsHome`, `insightsThisWeek`, `insightsAllFindings` and `insightsFinding`
use `tenantQuery`. `insightsHome` resolves the company and its owned holds,
then reads saved week counts and latest analysis time. It does not grant
access to another company merely because both share a host in `websites`.

`insightsFinding` returns null if a row is missing, foreign to the resolved
company or not PUBLISHED. It then calls `requireMySite` for the finding's
hold and returns its explicit presentation/evidence shape. That includes
story, action, confidence, sources, saved facts, comparisons, check timing,
progress and outcome. A newly stored private field does not automatically
belong in the client projection.

Use the existing hold/company readers for new filters. An explicit site ID
must be checked, not accepted as authority because it appeared in a URL.
`chosenSite` and the surrounding sites helpers resolve company-owned context;
review their exact behavior before adding an owned-only assumption to a
new report. Platform schedule administration is separate and uses
super-admin builders in `insightsTeam.ts`.

## Source facts and deterministic checks

`insightsReading.readWebsiteFacts` gathers source observations from existing
read layers. Relevant sources include Search Console, Analytics, shared
market data, AI observations, local data and crawl information.
`utils/insightFacts.ts` defines typed units and provenance: count, money,
percent, position, seconds, score and ratio, plus date spans and country
where applicable. The source layer retains the observations; a finding
stores the small subset it actually used.

Specialist prose refers to facts using keys such as `[[key]]`, rather than
freely inserting numerical claims. `fillFacts` resolves references and
`utils/insightEditor.editFinding` checks the draft. `typedNumbers` rejects
unsupported literal numbers except defined date/span cases. Comparisons
must preserve compatible measurement type, source class, span and country.
A rival's estimate is not interchangeable with the site's own counted
activity.

`madeOnPageClaim` handles a particular semantic risk: a landing-page metric
counts conversions during visits that started there, not necessarily actions
completed on that page. A draft saying the page produced every such
conversion can be sent back. `couldBeChance` supplies an implemented small-
change check; it is not a universal statistical significance service. Do not
promote these deterministic checks into a claim of certified causality.

The model still writes explanations and suggested actions. Passing the
editor shows that specified checks passed against named facts, not that
every interpretation is independently true. Keep untrusted page/source text
separate from instructions, and do not weaken source definitions to make a
particular finding publish.

## Runs, role members and watched stages

`insightsRun.runInsightsTeamNow` starts website analysis under the configured
strategy/team role. `insightsTeam.ts` resolves active role members, due owned
websites and company schedule settings. The default client cadence is the
weekly Europe/London schedule defined by `DEFAULT_CLIENT_SCHEDULE`; saved
company settings can disable it or choose another cadence. The team
system-agent setup preserves administrator changes rather than resetting
switches and schedules on every ensure call.

Website starts are staggered. The run gathers facts, builds candidates,
consults specialist models, joins relevant stories and applies editing
before saving. Configuration and model choices resolve through the existing
AI jobs/role mechanisms. A documentation pass must not run the team merely
to discover output, because it can invoke models, page requests and Google
reports. `insightsRun.ts` imports Analytics session/report helpers; collection
and analysis are not guaranteed to be pure local reads.

`insightsRunSteps.ts` defines GATHER, HISTORY, PICK, DECIDE and AFTER. New website runs use the durable `collectionSteps` chain named INSIGHTS, keyed by holding. `beginWebsiteRun` reuses an active chain instead of starting overlapping website work. `insightsRunWorker.continueRun` checks the current booking before dispatching; its run arguments carry that booking into publication checks. The collection watch owns saved-step recovery. Compatibility paths without that chain retain an eleven-minute Insights watch that can fail a stranded run rather than replay it.

The AFTER stage now advances through separate saved parts: Reports, Drafts, Buyer questions, Page reviews, Page decisions, Page decisions' box and Screens' boxes. Each failed part gets one five-second retry, then records its outcome and proceeds. The final result requires every stage in `utils/insightRunStages.ts` to be SUCCESS. An incomplete section finishes FAILED while retaining successful saved outputs; a weekly brief alone is no longer treated as whole-section completion.

## Save semantics and retention

`insightsTeam.saveWeek` receives the company, hold, week, run, verdict,
source counts, problems and edited findings. It replaces that website's
existing findings for the same week, stores up to `MOST_A_WEEK` (30), writes
or replaces the weekly record and returns published finding IDs. Both
PUBLISHED and SENT_BACK are stored states; normal customer reads expose only
published rows.

`insightsSchema.ts` defines `insightFindings.by_hold_week` and
`by_hold_check`, with `insightWeeks` indexed by hold/week, company/week and
creation time. Findings include snapshot facts, comparison groups, confidence,
rank and optional check/progress/outcome fields. `insightChanges`,
`insightTally` and other feature tables support related tracking, while
measurements and plans use separate latest-per-hold records. Presence of
those tables is not completion evidence for their wider UI workflow.

Retention is two times 365 days for the relevant weeks/findings, applied
in bounded cleanup when saving new weeks. It is not an hourly guarantee that
all old rows disappear exactly on their anniversary. Replacing a week also
means old finding IDs can disappear. A historical link is not an immutable
record of every intermediate model draft. Preserve audit/verification
records separately where their contract requires permanence.

## Action handoff and outcome timing

The finding detail route reads `api.insightsReads.insightsFinding` and builds
an evidence table and ruled-out explanations from the saved snapshot.
Its primary action calls `markInsightFindingActed` and then navigates to
`/app/assistant?ask=...` with a prepared question containing the host, action
and how to check it. The welcome composer receives that question rather
than executing the proposed business fix directly.

The acted marker therefore records a handoff, not proven task creation,
external publication or completion. Ask Hakken may propose a task that still
needs a person to confirm it. Changing this behavior would affect the
product's action and proof semantics and requires agreement outside a
documentation-only pass.

`insightFindingChecks.checkOpenFindings` inspects relevant open findings and
page/change evidence during periodic analysis. It can note changed page
content, restart timing and update progress before judging due items. It
reads pages with bounded concurrency. Outcomes RIGHT, WRONG and TOO_EARLY
are typed stored states, not an unrestricted promise that the inferred cause
was proven by a controlled experiment. Keep the clock's start, source dates
and comparison definitions attached to outcome displays.

## Verification and unresolved detail coverage

Relevant source tests include `insightsReading.test.ts`,
`insightsRunSteps.test.ts`, `insightsTrackRecord.test.ts`,
`insightsPeriod.test.ts`, `insightsLoad.test.ts` and editor/fact helper tests.
Future tests should verify publication against actual fact provenance,
foreign-company refusal, same-week replacement, watch closure and the
separation between handoff and real action. A test asserting only that a
headline exists would miss the important contracts.

This review inspected the named core modules and selected reader/action
paths. It ran no model, page fetch, live Google request, scheduled analysis,
application gate or browser session. The related-guide links below now cover the additional report and planning workflows. Detailed Track record, readership analytics and collector operations remain pending; do not mark the entire Insights section complete
because the core findings pair exists.

Related coverage now includes [Reports](./insights-reports-and-exports.md), [Strategy and planning](./insights-strategy-and-planning.md), [Measurement and enquiries](./insights-measurement-and-enquiries.md), [Page reviews and experiments](./page-reviews-and-experiments.md), [Competing pages](./competing-pages-and-search-ownership.md), [Page decisions](./page-decisions-and-create-candidates.md), [Leaderboards](./insights-leaderboards.md) and [AI growth](./ai-search-growth-and-buyer-questions.md). See [Track record](./insights-track-record.md) for change/outcome evidence. Internal editorial operations are documented in the developer and operator directories; they are not additional customer controls.

## Durable refresh, recovery and source generations

These details were rechecked against concurrent, uncommitted local implementation during the final documentation audit. They describe the files inspected, not a deployed reliability guarantee. New entry points include `insightsRunWorker.ts`, `insightsRunState.ts`, `insightHistorySteps.ts`, `insightHistoryWork.ts`, `insightsReadingParts.ts`, `insightsReadingSteps.ts` and `insightCompetingSteps.ts`. The current test sources include the corresponding history, reading, competing, run-step, report and request-reuse tests; none ran in documentation maintenance.

`insightHistorySteps.planForRun` fixes source dates and builds source/kind/month pieces from paged metadata. HISTORY keeps its position, totals, problems, wait count and attempt count in booked arguments. A non-quota exception gets one delayed retry. A quota exception can defer until after the hour while the cumulative wait count is below twenty-six; it does not spin immediately against Google. An exhausted or repeated failure advances the piece with a recorded problem. The aggregate History stage fails if any problem remains. A source without an eligible connection contributes no planned piece; a successful empty plan is not proof both providers were connected.

The annual change reader moves whole-list comparison into a Node action. `pageYearPart` reads one saved Analytics list part at a time, pins slot/hash across each year, and the worker rechecks both generations before comparison. Missing/incomplete parts and rebuilt generations cannot silently form one mixed comparison. Removed-change reconciliation still initially reads at most two hundred stored removed entries. The path-word matching optimization preserves the matching threshold and observed order; it does not turn an inferred move into verified causation.

Competing-page preparation also runs through a Node action with paged history, list parts and batches of twenty-five page/search lookups. Build identities are checked again after calculation. These changes reduce the size of individual database operations; they do not remove every retained-data cap elsewhere or guarantee arbitrarily large sites fit all action resources.

`assertInsightsPublisher` checks the run, holding/company relation, active status and matching open chain/booking inside guarded publishing mutations. An older or stopped worker cannot publish through those guarded paths over its successor. Optional run arguments retain compatibility with other internal callers, so this is not a claim every historical internal write is globally protected. Failed analysis can save independently successful Measurement/opportunity readings while retaining the previous weekly findings rather than replacing them with an incomplete analysis.

Shared model asks hash the request label, instructions, prompt and resolved model configuration into a request key. Successful full answers can be reused within the same company/run after validation; two recorded failures stop another ask for that key. The run log stores the complete response separately from its truncated preview. This is application-level reuse, not provider-level exactly-once billing: a response lost before persistence can still have cost money. A fresh run has a different reuse scope.

The shared Insights layout uses `InsightsRefreshNotice` and `insightsReads.sectionRefresh`. It shows per-website stage counts, unfinished sections or missing recorded refresh evidence. The query checks a supplied site through company ownership and selects owned holdings. Inspect the full stage result and actual saved outputs when diagnosing failure. An old unrecorded run, a saved report and a current successful whole-section refresh are different evidence.
