---
product: Hakken
documentation_type: Developer guide
feature_area: Insights Track record
audience: developer
source_repository: roninsatwork/Hakken
source_path: docs/developer/insights-track-record.md
last_reviewed: '2026-10-26T15:13:08+00:00'
reviewed_against: current implementation
status: Current
---
# Insights Track Record Implementation

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Insights Track record
> **Reviewed:** 26 October 2026, 15:13:08 GMT (Europe/London)
> **Source path:** `docs/developer/insights-track-record.md` · **Status:** Current


Track record is the tenant-scoped read and measurement history behind `/app/insights/track-record`. Its main entry point is `insightsTrackRecord` in `convex/insightsReads.ts`. The page composes published finding rows, persistent tallies, observed changes, aggregated learnings, and approved drafts attributed through a held Analytics campaign slot. These sources have different windows and counting rules. Keeping them explicit prevents the interface or a report from implying a single complete causal ledger.

This is a source review, not a production acceptance record. No provider was contacted, no page-check action was executed, and no saved record was created as part of documentation maintenance. Product direction and external integration cutover remain governed by [PRODUCT.md](../../PRODUCT.md). Read [Insights findings](./insights-findings.md), [measurement and enquiries](./insights-measurement-and-enquiries.md), and [website assets and drafts](./website-assets-and-drafts.md) for the adjacent contracts.

## Tenant query and projections

`insightsTrackRecord` uses `tenantQuery` and `sitesFor` to resolve the requested `companyWebsites` holding or the company's accessible owned holdings. It builds a holding-to-host map and projects only those sites' findings and changes. Do not replace this with a website-wide read: company holdings are the ownership boundary even where bought external measurements are shared elsewhere.

For each holding, the query reads up to 500 `insightFindings` rows through `by_hold_week`, descending, and then keeps `PUBLISHED` rows. Returned fields include headline, week, check day, acknowledgement time, outcome, outcome note, clock, and progress. The combined list sorts by check day, placing missing days after dated rows. Filtering after the cap means this is a bounded published-history projection rather than an exhaustive published count.

With a selected site, outcome totals are calculated from returned findings. Without a site, up to 20 `insightTally` rows are read through `by_company_specialist` and summed. The latter totals can survive outside the current finding window. Tests intentionally assert this distinction; changing it requires an explicit contract decision rather than a documentation correction.

Changes are read through `insightChanges.by_company_created`, newest first, taking 200 before filtering to the holding map. A site selection does not increase this budget. Learnings are loaded only for kinds present in those retained changes. The response strips internal company identifiers from cross-company summaries and exposes only counts once the minimum contributing-company threshold is met.

## Open findings and checking orchestration

`insightsTeam.openFindings` supplies the internal checking inputs. It reads bounded recent finding rows before retaining published, unscored findings with a watched fact. It also supplies observed page changes from a bounded change read. The helper `checkOpenFindings` in `insightFindingChecks.ts` builds a latest-change-day map, resolves relevant pages from saved clocks or watched keys, and reads page facts in batches of five where an origin is available. Fetch errors become missing page evidence rather than successful observations.

`utils/insightClock.ts:trackOpen` is the pure decision layer. A finding with no stored clock can receive one from its watched key and written day. A later detected change to its page restarts the clock with `PAGE_CHANGED`. `checkOnFor` includes the selected 30- or 90-day span and a three-day lag. `clockFor` chooses supported held facts rather than assuming every metric has every window.

Progress records retain today's check day, current value, comparison value or null, comparison basis, unit, and optional measurement boundaries. A year comparison wins over a preceding-period comparison. A due clock is judged only when the current fact's start is after the clock's start. An unclear 30-day outcome extends to 90 days only when the requisite longer facts exist. If the current fact disappears, the missing-figure grace branch closes as `TOO_EARLY` after 28 further days. Missing comparison or unsuitable boundary states need to be traced individually; the function does not provide a universal eventual-resolution guarantee.

For unwindowed facts, the original saved fact is compared with the current one when due. `outcomeOf` applies count uncertainty and a minimum absolute proportional movement before deciding whether the direction agrees with the prediction. A resulting `RIGHT` means the direction rule matched, not that an intervention caused the change.

## Persistence and replay limitations

`insightsTeam.scoreFindings` is internal. Its optional update loop reloads a finding and only patches clock/progress fields while no outcome exists. Its outcome loop patches the outcome and increments a company/specialist tally without checking whether that outcome has already been counted. Normal orchestration excludes scored findings on its next read, but replaying the same outcomes directly is not idempotent. Concurrent or manual recovery must not assume an exactly-once tally guarantee.

The mutation trusts its internal caller's company and finding association. Documentation does not turn internal visibility into an end-user authorization API. A future repair should examine both ownership consistency and deduplication, with meaningful regression evidence; this maintenance pass leaves implementation untouched.

`insightsTeam.saveChanges` uses holding, kind, source path, and optional day to recognize a saved change. Its same-kind/path lookup takes only 20 rows before finding a matching day. Existing records can receive new after values, results, or destinations. New definite outcomes contribute to `insightLearnings`; existing `TOO_EARLY` records contribute when they become definite. Changing one definite outcome to another does not reverse and reapply the old aggregate.

A previously inferred `REMOVED` row can be deleted when later activity contradicts it, or patched into a replacement/merge. These corrections do not generally undo already accumulated learnings. Cleanup deletes at most 20 company changes older than two years during each saving call. It is incremental cleanup rather than a scheduled precise-expiry contract. Persistent tallies and learning aggregates have separate record lifetimes.

## Observed changes and outcome calculations

`utils/insightTrack.ts` contains page-change inference, fingerprint comparisons, and before/after measurement. `fingerprintChanges` requires usable page facts and positive word counts; it normalizes headline case and whitespace, observes price/proof/form changes, checks material call-to-action movement, and compares structured information. A failed fetch cannot establish an unchanged page.

`pageChanges` infers removed, replaced, and merged pages from annual activity and path similarity, subject to traffic and enquiry thresholds. It does not read CMS revisions or prove redirects. `measuredAround` excludes the changed day and sums the 30 days on either side. Its boundary checks do not establish that every interior day is present. `profileChangesOf` applies website-wide enquiries around selected own-profile activities, so it must not be described as profile-specific conversion attribution.

`resultOf` returns `GREW` at after greater than or equal to 1.2 times before, then `HELD` at 0.8 times before, otherwise `LOST`. Because the growth branch is first, before=0 and after=0 returns `GREW`. Keep the figures and this edge case visible in downstream claims. Missing after-period evidence produces a `TOO_EARLY` result through the surrounding helpers, rather than silently establishing a successful outcome.

## Campaign attribution and privacy

Approved draft attribution reads local, reviews, and links draft areas, up to 200 per area per holding, restricted by creation time to the last 365 days before filtering status. Approval day uses `decidedAt` with creation fallback. The query reads the Analytics connection and `slotKey("campaign", "365", "NOW", EVERY_DEVICE)`, and uses its configured counted events to calculate enquiries.

Each draft matches the campaign identifier and an optional `utm_source` parsed from its link against the source/medium key. This is per-draft matching over a shared campaign dataset. Two drafts with the same tags can receive the same counts, so their totals are not additive unique attribution. No connection or no campaign slot yields empty rows and zero totals. A malformed saved link can also make the unguarded URL parse throw; valid draft production should not be treated as proof that all historical rows are parseable.

`insightLearnings.by_kind` contains aggregated outcomes and a set of contributing company identifiers. At five companies, the tenant response exposes company count and lost/held/grew totals. It does not return those identities. This threshold is not cohort matching, anonymization proof, or causal adjustment. Own counts come from the bounded retained window; global counts are accumulated separately and need not reconcile after corrections or cleanup.

## Client behavior and verification

The page applies independent search terms to changes and findings, and a result selector to findings. An outcome-less finding whose day has passed is displayed as `TOO_EARLY`; otherwise its derived state is `DUE`. This display derivation does not persist an outcome. `useSitePager` paginates returned arrays, and `ListDownload` receives the filtered arrays, exporting the bounded list rather than merely the visible page.

Approved drafts are mapped to synthetic change rows: enquiries greater than zero means grew, visits alone means held, otherwise waiting. That is separate from proportional change results. Finding rows navigate to detail and can display `soFarRow` progress until a stored outcome exists. Reading the screen has no supplier refresh side effect.

Relevant evidence includes `convex/insightsTrackRecord.test.ts`, `convex/utils/insightClock.test.ts`, and `convex/utils/insightTrack.test.ts`. The first covers selected-site versus company tallies and saved clock/progress projection; the utility tests cover clock decisions and sampled before/after calculations. Their presence is local implementation evidence, not proof of exhaustive production history, campaign publication, replay safety, or completed external rename cutover. Configuration is inherited from held site/Analytics settings; this query introduces no credential values or new environment variables.

## Annual-list worker and rebuild conflicts

`insightsReading.pageChangesInternal` is now an internal action delegating to `insightsReadingSteps.pageChanges`. Each year's retained landing-page list is read through `insightsReadingParts.pageYearPart`, one part per query. Slot and hash identify the saved generation; each is checked again before comparison. A concurrent rebuild raises a conflict rather than mixing generations. The first current-year part still reads at most two hundred prior REMOVED changes for reconciliation. This worker preserves the documented inference thresholds, not an authoritative page-move log. The run's Track record stage records the action outcome, independently from the saved weekly brief. Focused scale and generation-conflict test sources were inspected without execution.
