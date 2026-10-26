---
product: Hakken
documentation_type: Developer guide
feature_area: Insights strategy and planning
audience: developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/insights-strategy-and-planning.md
last_reviewed: '2026-10-26T12:05:32+00:00'
reviewed_against: current implementation
status: Current
---
# Insights Strategy And Planning

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Insights strategy and planning
> **Reviewed:** 26 October 2026, 12:05:32 GMT (Europe/London)
> **Source path:** `docs/developer/insights-strategy-and-planning.md` · **Status:** Current

Strategy and planning transform retained analytics, Search Console, page classifications and search ranks into saved service calls, opportunities and page priorities. `insightsReading.ts` prepares evidence, `utils/insightStrategy.ts` and `utils/insightPlan.ts` implement rules, the Insights run applies eligible specialist calls, and `insightsReads.ts` exposes current projections. Public page changes are not performed by these reads.

## Routes And Owned-Site Scope

The routes are `src/app/(dashboard)/app/insights/strategy`, `strategy/service`, `opportunities` and `page-plan`. `insightsStrategy`, `insightsService` and `insightsPlan` use tenant queries and `sitesFor`, which restricts company holdings to OWNED and verifies a supplied site ID. Without selection these queries use the first owned site, not an aggregate or globally newest week.

Strategy and service use that site's newest `insightWeeks.by_hold_week`. Plan reads `insightPlans.by_hold`. Missing weeks/services return null; missing saved plan can leave a site result with plan null. No provider purchase or live source fetch is introduced by the screen query.

The Page plan route also reads `insightDecisions.insightsPageDecisions`, displaying broader page decisions and proposed creates alongside the older priority plan. Those source/decision contracts are separately inventoried. This guide covers the rule-based saved plan; the separately reviewed [page decisions](./page-decisions-and-create-candidates.md) and [competing-page](./competing-pages-and-search-ownership.md) guides cover those wider contracts.

## Service Evidence And Windows

`strategyInternal` reads up to nine hundred holding pages ordered by clicks. It recognizes SERVICE, HOME/root and ARTICLE classifications, grouping articles into the guides key. Analytics landing slots use 365 NOW and YEAR with `countedOf`/`conversionsOf`, decoded page identities and page classification. It sums enquiries, visits and people rather than treating them as one interchangeable count.

Search Console uses web/page lastQuarter NOW and BEFORE. These are different time windows from annual Analytics. Missing year or earlier Search Console slots turn the applicable prior fields null, rather than inventing an observed decline from a fabricated zero. Some initial accumulator values are zero until source-availability correction applies.

`rankedServices` keeps rows with current enquiries, prior enquiries or current clicks, then orders by enquiries/clicks and caps at forty. Its executable predicate does not keep a row solely for prior clicks despite a broader comment. Documenting that filter avoids promising a complete catalogue of all business services.

`insightsStrategy` reads up to sixty findings for the newest week, keeps PUBLISHED rows, rank-orders and chooses three for the action roadmap. This roadmap is a projection of accepted findings, not a modification to PRODUCT.md or the repository's product roadmap. Its expect field uses finding headline, with action, evidence wording and optional check date.

## Rule And Specialist Calls

`verdictOf` assigns READERS to guides. With no prior enquiry baseline it uses five current enquiries for GROW; with a zero baseline it uses three. A decline of at least half from a positive baseline yields BUYERS_WORDS when the old count was at least ten, otherwise YOUR_CALL. Growth of at least twenty percent with at least three enquiries yields GROW; remaining services are STEADY.

`servicesToCall` selects non-guides with current enquiries and no carried agent decision. `carryServices` preserves prior specialist calls when `stillDecided` finds the relevant rule-reading state unchanged. An AGENT decision can therefore retain an older decidedWeek while appearing in a newer saved week.

`applyServiceCalls` only accepts asked page IDs, known non-READERS calls and a valid reason through `whyText`. It records provenance and week. These checks constrain output shape and scope; they do not prove that the model found the commercial cause of a decline. Fallback rule calls remain labeled as rules.

The run resolves `planInternal` and `strategyInternal` with catch-to-null/empty behavior, so some missing planning content can coexist with other successful analysis. Inspect actual saved data and logged failures before interpreting an empty screen as a comprehensive no-opportunity result.

## Service Detail Bounds

`insightsService` finds the requested page in the selected latest summary. Non-guide detail reads up to three hundred `siteKeywordRanks.by_site_page_band_position` rows for the website/place/page, chooses fifteen highest-volume entries, then reads each watched rival's rank through `by_site_keyword`. It projects the best stored rival position, not a new results-page measurement.

This path does not apply all current-copy freshness logic used in the separate content-gap computation. Do not promise every detail row has an independent latest-check reconciliation merely because another subsystem has one. Guides intentionally produce no one-page keyword list.

`siteClicks` sums clicks over the saved service rows. It is a service-scope denominator, potentially affected by page classification and the forty-row bound. The detail's click share is not guaranteed to cover the whole website's Search Console clicks. Ratios involving enquiries still depend on the configured analytics conversion mapping.

## Opportunity Inputs And Estimates

`planInternal` reads bounded holding-page context and annual NOW/YEAR landing-page figures, then queries rank bands p04_10, p11_20 and p21_50 with positions at most thirty. Each band reads up to three hundred rows and skips LOST or missing positions. Search Console query rows come from retained web/query lastQuarter NOW evidence.

`opportunitiesFrom` deduplicates case-insensitively and excludes known brand searches. A matching non-brand Search Console average replaces Visibility's position for the calculation. Candidates must end within four through thirty. Search Console-only candidates require fifty impressions and can lack an identified landing page.

Page rate needs at least thirty annual visits. Estimated worth multiplies available monthly volume, or impressions divided by three, by the difference between a fixed current-position click-share curve and the average first-three share, then by page rate. Negative reach is floored at zero and results rounded. This is estimated additional enquiries, not currency, revenue or guaranteed causal lift.

The helper retains one hundred opportunities ordered by known worth and then estimated reach. Unknown rates leave worth null rather than assigning a fallback company-wide conversion rate. `siteRateOf` separately divides total held landing-page enquiries by held visits; the evidence can remain incomplete despite a numeric result.

## Page Priority Rules And Persistence

`pagePlanFrom` assigns a page only once in rule order. A service/home enquiry decline with prior at least ten and current at most half gets REBUILD. A losing recorded MERGED/REPLACED successor can get RESTORE. A money-page rate drop needs at least three hundred current visits, an earlier rate of at least one percent and current no more than seventy percent of that rate before REFRESH.

STRENGTHEN selects up to three opportunity pages with adequate known rate and fifty visits. ARTICLE declines can receive REFRESH_OR_RETIRE; a guide with at least five percent of held visits and at most one enquiry can get KEEP_ROUTE. A successful merge/replacement can get KEEP. These are recommendation codes, not commands executed against a CMS.

Rows order by action priority then estimated annual stake and cap at thirty. `planInternal` reads up to one hundred saved changes. For each planned page it reads forty rank candidates and chooses two non-LOST searches with a position no greater than thirty for shouldWin. That list is bounded evidence, not a generated complete editorial brief.

`insightsTeam.saveWeek` replaces or inserts `insightPlans` when a plan is supplied, with holding/company/week and current creation time. If no plan is supplied, that path does not prove an old plan was deleted. `insightsPlan` enriches saved page references with current company page classifications through `pageKindsOf`, so displayed kinds can be newer than the saved opportunity calculation.

## UI And Validation Evidence

Strategy, opportunity and plan screens provide local filters, shared Sites pagination and list CSV downloads over supplied rows. The broader page-decision chart and tables have their own projection. No create, redirect, removal or rewrite action is performed by exporting a recommendation.

`utils/insightStrategy.test.ts` covers specialist attribution, eligible calls and carry-forward behavior. `utils/insightPlan.test.ts` covers within-reach estimates, brand exclusion and priority rules including conversion decline. Related read-budget tests cover query shapes. These declarations were read, not executed; no model, app, browser or live Google call ran.

See [Insights Findings](./insights-findings.md), [Insights Reports And Exports](./insights-reports-and-exports.md), [Google Analytics](./google-analytics.md) and the [user guide](../end-user/insights-strategy-and-planning.md). The source determines these implemented heuristics; PRODUCT.md intent, acceptance criteria and roadmap remain unchanged. Neither recommendation generation nor local tests establish live integration acceptance or business outcome proof.
