---
product: Hakken
documentation_type: Developer guide
feature_area: competitor discovery and content gaps
audience: developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/competitor-discovery-and-gaps.md
last_reviewed: '2026-10-26T11:52:18+00:00'
reviewed_against: current implementation
status: Current
---
# Competitor Discovery And Content Gaps

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** competitor discovery and content gaps
> **Reviewed:** 26 October 2026, 11:52:18 GMT (Europe/London)
> **Source path:** `docs/developer/competitor-discovery-and-gaps.md` · **Status:** Current

Competitor reporting combines private company website groups, shared search/AI evidence and per-holding discovery records. `siteCompetitors.ts` implements watched comparisons, organic discoveries, suggestions, the market map and content-gap paging. `siteRivalMoves.ts`, `siteRivalCited.ts` and `siteDiscovery.ts` supply adjoining detail evidence. These reads do not add tracking, execute a provider purchase or produce a content draft.

## Routes, Access And Identities

Routes are under `src/app/(dashboard)/app/sites/[siteId]/competitors/`: index, `organic`, `suggested`, `map`, `gap` and `rival`. Queries start with `requireMySite` in tenant wrappers. `myRivals`, `companyHolds`, `listHold` and `listWebsiteId` resolve company membership and the list owner's identity rather than inferring authorization from a shared host.

`discoveredCompetitors` belongs to a company holding, while collected site ranks and figures are shared website/place facts. Organic discovery reads by `by_company_website`; overlap detail uses `by_company_website_host`. `sharedWithRival` explicitly checks the rival holding belongs to the same company, then looks for overlap in the open site's discovery before falling back to the other holding's discovery.

`rivalCitedPages` restricts `rivalId` to `loadRivalHolds`, returning no examples for an unrelated hold. This is distinct from accepting a public host as a universal entry point. Keep holding IDs, shared website IDs and discovery-row IDs separate in frontend arguments and documentation.

## Watched Search Comparison

`listRivals` gets active `searchStandings` candidates capped at three hundred, group rivals, private questions and their retained answer summaries. It allocates `perRival` as at least one and at most one hundred, further bounded by floor of 2,500 divided by rival count. It then selects active candidates with a checked day.

The list owner can differ from the open shared website. `listWebsiteId`, `searchStats` and `asOfListCheck` align another website's standing with the reference list's latest evidence. This avoids presenting a stale positive position as current when a website was absent at the newer check. It does not establish complete same-instant observation across every independent dataset.

Counts increment when a rival has a better observed position or the open website lacks one, with the reverse for you-beat. Mutual absence and equal places do not award a win. `rankedOn` counts positive-style retained rival placements and `comparedOn` reports the bounded candidate count. These should accompany the verdict rather than be omitted in favor of a single winner label.

Private AI counts read `holdQuestionAnswers` once, join active selected questions and engines, sum asked and named counts and retain latest named days. One answer can name several websites. The observed denominator is not an exclusive market-share total, and no other company's question choices are read to expand it.

`trackingVerdicts.rivalVerdict` prioritizes holding age below twenty-eight days, absent last-seen, then fifty-six-day quiet evidence before comparing beats counts. Last seen can come from Google rank or AI naming. These are fixed interpretation thresholds, not an automatic pause or removal mechanism.

## Organic Discovery And Suggestions

`listOrganicCompetitors` reads up to three hundred discovery records, excludes the open website, projects type/overlap/position/traffic/domain metrics and marks currently held rivals. Day is last discovery evidence for that hold. The wider supplier total is separately read from recent domain-competitor metrics through `siteDiscovery`, bounded to ten records before choosing an applicable place.

`listSuggested` joins the private list's AI summary, discovery records and all readable company holds. `pickSuggestions` excludes held website IDs and hosts, selects up to ten AI-named examples and then sorts organic discoveries by intersections. Organic records with `decidedAt` or duplicate offered hosts are skipped. This is ordered evidence selection, not a newly trained competitor classifier on page load.

`seoDiscoveredCompetitors.ts` exposes super-admin acceptance and dismissal. Acceptance calls `trackCompetitorCore` with discovered provenance, then records decision fields. Dismissal marks the row, preserving the decision across later discovery. Customer suggested pages call read queries rather than these mutations. Do not describe customer report access as permission to operate platform administration.

`seoDiscoveredCompetitors.test.ts` covers category evidence, decision-off behavior, per-hold filing, acceptance through the normal tracking core and dismissal persistence. Classification is optional evidence: a missing kind must remain unknown rather than be converted into verified direct competition. Discovery retention is RECORD in `keepRules.ts`; a decision does not mean the record was physically deleted.

## Market Map Metrics

`marketMap` reads held website figures using `latestFigures` and `searchTotalOf`. Discovered candidates contribute only when whole-domain keyword or traffic values exist. Held hosts are excluded from the discovered candidates to avoid duplicate roles, and traffic projection may round available estimates.

The response distinguishes YOU, RIVAL and FOUND with per-row day and optional shared-keyword count. Those inputs are not guaranteed to share a collection day. Domain totals, overlap counts and estimated traffic must not be labeled as measured visits or commercial market share. The map is a search-scale comparison, separate from Local's geographical market data.

## On-Demand Content Gap

`listContentGap` returns an explanatory empty result for tracked holdings. For owned sites it builds competitor columns from the actual group and calls `siteContentGap.contentGapOf` with shared website IDs and place. A missing own keyword copy produces `preparingPage`; a rival without a copy adds nothing yet.

`contentGapOf` reads compact keyword copies and uses `keywordStanding` through `rankingNow` to keep current placements at each copy's latest check. Old lost/stale rows do not automatically suppress a genuine gap or create a current rival rank. The gap is computed at read time rather than stored again per company holding.

It reads at most twenty-five rival copies and keeps up to `GAP_KEYWORDS_PER_RIVAL`, five thousand highest-volume current rows per rival. Own current keywords are subtracted, remaining rows grouped by keyword and capped at fifty thousand after volume ordering. The cut flag reflects the gap cap; it is not a guarantee that every rival copy was complete or that all possible competitors were considered.

A gap row uses maximum known volume among contributors, first available difficulty, retained intent, all contributing rival positions/traffic and newest contributing day. Search, intent and minimum-rival filters apply before page slicing. Position/traffic sorting requires a valid rival holding from the response columns; otherwise the query falls back to volume. Summary guidance uses the whole computed gap, independent of those filters.

The frontend's filters and columns omit CPC and page-feature fields by current implementation. Do not reintroduce old drawn-plan columns into documentation as though they remain on screen. Existing plans are historical/planned evidence and remain unchanged by this pass.

## Rival Detail And Changes

The rival detail composes `siteCharts.siteAndRivals`, `listRivals`, `sharedWithRival`, `siteRecords.sharedSearches`, period series and `siteRivalCited.rivalCitedPages`. Broad discovery overlap is distinct from the retained shared-search detail. A headline larger than a detail sample is not proof another company's list leaked or a provider total must be wrong.

`rivalCitedPages` takes at most sixty asked question entries, thirty cited-page rows per expanded question and returns twenty-five combined pages. It preserves assistant identities and up to three example prompts per page. These are bounded citation examples from the company's own question context, not the rival's private prompts.

`rivalMoves` reads four hundred volume-ordered rank rows per applicable rival. New-search selection excludes that sample's earliest first-seen day and applies the selected calendar span. Climbed and fell count current UP/DOWN/LOST statuses across those rows without filtering each status change to that same span. Keep that difference explicit rather than describing all moves as interval event counts.

Visits use latest monthly series points inside selected and prior spans; checked means the selected span produced series evidence, while lastCheck comes from latest figures. No selected-span check should not be described as a full measured zero in actual competitive activity.

## Validation And Boundaries

Relevant evidence includes `seoDiscoveredCompetitors.test.ts`, suggestion/stale-standing cases in `siteAuditFixes.test.ts`, shared sorting tests and the content-gap page tests. Their declarations were read rather than executed. No application, browser, collection, live AI or paid provider operation ran for this documentation pass.

See [Organic Keywords And Pages](./organic-keywords-and-pages.md), [AI Questions And Answers](./ai-questions-and-answers.md), [Brand Radar](./brand-radar.md) and the [user guide](../end-user/competitor-discovery-and-gaps.md). Website tracking permissions and collection remain separate contracts. Local implementation does not establish deployment, rename-cutover acceptance under PRODUCT.md section 33 or proof that a proposed content opportunity produced leads and sales.
