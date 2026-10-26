---
product: Hakken
documentation_type: Developer guide
feature_area: page reviews, funnel and experiments
audience: developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/page-reviews-and-experiments.md
last_reviewed: '2026-10-26T12:12:21+00:00'
reviewed_against: current implementation
status: Current
---
# Page Reviews, Funnel And Experiments

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** page reviews, funnel and experiments
> **Reviewed:** 26 October 2026, 12:12:21 GMT (Europe/London)
> **Source path:** `docs/developer/page-reviews-and-experiments.md` · **Status:** Current

`insightsConversion.ts` implements saved funnel/page-review reads and the proposed experiment lifecycle. `insightsRunAfter.reviewPages` builds the conversion summary from retained page checks, analytics and optional model output. `utils/insightConversion.ts` defines verdicts, projections and fallback rules. The workflow is observational and does not perform public page changes or randomized traffic allocation.

## Routes And Access

Customer routes are `src/app/(dashboard)/app/insights/funnel`, `page-reviews`, `page-reviews/page` and `experiments`. They read `insightsConversion.insightsConversion`; page detail also joins service and rival-citation evidence. The experiment page invokes `startExperiment` for live/not-live actions.

`chosenHold` checks an explicitly selected site with `requireMySite` and requires OWNED. Without a selection it reads fifty company holdings and selects the first owned one. The main query uses tenant authentication, reads the selected summary and returns up to fifty experiments for each READY, RUNNING and DONE status. DROPPED is not among those reader statuses.

`startExperiment` checks the stored experiment's holding through `requireMySite`, but adds no explicit oversight-role write refusal or separate owned-relationship guard on that mutation. Do not infer a stricter policy from the read selector or generic tenant wrapper. Any authorization repair needs a separately approved application task.

## Page Check Inputs

`moneyPageChecks.checkTargets` reads four hundred holding pages ordered by clicks and picks up to twelve eligible home/money-type pages. A roughly weekly `CHECK_EVERY_MS` interval avoids repeat checking unless force is supplied. These are bounded targets, not a complete crawl of all site content.

`checkWebsite` can obtain a Search Console access token for URL Inspection, inspect public page content and use PageSpeed when `PAGESPEED_API_KEY` is configured. Missing connections or key produce recorded problems rather than proof indexing/speed is healthy. This documentation pass read the variable name and code only; no key value or service call was accessed.

`reviewInputs` reads up to forty-eight saved money-page checks and joins annual/current/year and ninety-day landing evidence, page titles and available last-month Clarity behavior. It excludes zero-current-visitor pages and orders by visitors. The action then selects at most eight inputs (`PAGES_REVIEWED`). Missing from the review set does not mean a page passed a comprehensive conversion test.

`landingByPath` uses decoded saved landing-slot addresses. For period 30 it sums row.visits; for 90 and 365 it sums row.people into the helper's visits-shaped field. Enquiries use the connection's counted conversion mapping. Document this measure distinction rather than treating every field named visits as identical session counts.

## Review Generation And Fallback

`insightsRunAfter.reviewPages` gathers limited prior-page journey evidence, builds the specialist prompt from saved content facts and behavior and asks through stored team/model configuration. Valid results must identify a page in the given inputs and a known verdict; bounded reason/step text is retained. Missing or invalid answers use `verdictByRule` and can have an empty reason or steps.

Fallback order is REWRITE_TOP when visitors per enquiry worsens by at least half, ADD_COMPANY_FACTS for missing required organization structured data, MOVE_BUTTON when firstAsk exceeds 0.3, ADD_PRICE for a SERVICE without detected price, ADD_PROOF when proof is absent, otherwise KEEP. The order matters because only the first matching rule wins.

`pageFactsOf` and associated checks use bounded text/HTML heuristics. Detected price/proof/form and first-ask location are evidence features, not complete semantic verification. A known verdict plus a valid output shape does not prove the suggested cause or expected commercial impact.

The detail page's To tasks action routes to `/app/assistant?ask=...` with a prepared request. It does not directly call a task mutation or guarantee a saved task. Rival citation examples and came-from observations are also bounded joins, not a full competitor strategy or individual-person journey log.

## Funnel And Source Projections

`funnelFrom` uses sc.impressions.90 and sc.clicks.90 for SHOWN/CLICKED, with Organic Search Analytics visits/conversions for VISITED/ENQUIRED and corresponding year facts. Missing facts remain null. The result is aggregate source juxtaposition, not identity-linked progression or a complete sales funnel.

`sourcesFrom` reads channel visits/conversions over 365 now and before, keeps positive-current-visit channels and orders by visits. These annual source rows have a different window from the ninety-day Google funnel. The general selected-period menu is not an input to this saved conversion reader.

`saveConversion` replaces or inserts `insightConversions.by_hold` with company, week and calculated funnel/source/page arrays. It represents latest saved review state, not a full historic review archive. `insightsConversion` enriches page kinds from current classifications on read, so displayed classification can be newer than the saved review.

## Proposed Experiments And Identity

For each non-KEEP review, `saveConversion` uses page plus verdict as the key in `insightExperiments.by_hold_key`. Existing READY records get their reason updated. Any existing matching record otherwise suppresses insertion, including retained DONE or DROPPED records. This is not an automatic new weekly experiment for every repeated suggestion.

New records are READY with company, holding, page, verdict, reason and creation time. The current code does not deploy a proposed variant, create a redirect or prove a public change occurred. A person starting it is a local assertion about that separate implementation.

`startExperiment` accepts RUNNING, READY and DROPPED. A non-running state clears startedAt and baseline. It does not clear an old result field in that branch, so reset/restart workflows are not a pristine versioned sequence of independent measurements. The normal UI only offers its supported subset of transitions.

## Baseline, Eligibility And Missing Data

Starting RUNNING reads `landingByPath` for period 30 NOW, saves its actual from/to and values and records current time. The helper maps that request to the saved lastMonth slot. Despite comments describing thirty days before going live, it is not an on-demand exact trailing window ending at startedAt.

Missing slot/page evidence falls back to zero visits/enquiries and empty dates. This is a material uncertainty: zero under that fallback cannot establish measured zero business activity. Starting does not refuse until a valid baseline is present. Guides must make this visible rather than interpreting every numeric baseline as verified evidence.

`saveConversion` reads at most fifty RUNNING records, selects startedAt older than fifty-six days and measures them using the current saved lastMonth slot. It writes DONE with that result. With missing slot/page it again uses zero/empty dates. It does not require a statistical threshold, a source-ready flag or a defined exact day range before completion.

Due measurement is triggered by a later conversion save rather than a per-experiment day-fifty-six timer in this module. A long-running record can wait for the next suitable analysis. This before/after design has no randomized control, traffic splitting, concurrent-change exclusion or causal inference guarantee.

## Storage, UI And Retention

`insightsSchema.ts` defines `insightConversions` with `by_hold` and `insightExperiments` with holding/status and holding/key lookup paths. Experiment baseline/result store visits, enquiries and dates; status and startedAt drive eligibility. Reader visit context can come from the current page review, independently of the stored baseline.

The experiment page filters and paginates the supplied records. DONE wording compares saved enquiry counts when both baseline and result exist; it does not independently verify source completeness. A local CSV contains projected page/verdict/reason/status wording rather than raw analytics events or proof of deployed changes.

`keepRules.ts` marks conversions LATEST and experiments RECORD. These handlers contain no automatic expiry of a duplicate experiment merely because the week changed. Retained same-key records can affect suggestion reuse. A reset is a record mutation, not rollback of public content.

## Verification And Adjacent Contracts

`utils/insightConversion.test.ts` covers funnel source selection, annual channel rows, parsed page facts and first-rule verdict behavior. `insightsLoad.test.ts` includes the conversion reader's budget. These declarations were read, not executed. No current-turn test result proves start/due behavior, clipboard/task creation or live provider acceptance.

See [Insights Measurement And Enquiries](./insights-measurement-and-enquiries.md), [Insights Strategy And Planning](./insights-strategy-and-planning.md), [Microsoft Clarity](./microsoft-clarity.md) and the [user guide](../end-user/page-reviews-and-experiments.md). Missing-data measurement and role-policy findings require separate source review/fixes. PRODUCT.md intent and section 33 external cutover remain unchanged; local heuristic evidence does not prove delivered commercial outcomes.
