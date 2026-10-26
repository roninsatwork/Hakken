---
product: Hakken
documentation_type: Developer guide
feature_area: AI-search growth and buyer-question panels
audience: developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/ai-search-growth-and-buyer-questions.md
last_reviewed: '2026-10-26T15:16:13+00:00'
reviewed_against: current implementation
status: Current
---
# AI Search Growth And Buyer Questions

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** AI-search growth and buyer-question panels
> **Reviewed:** 26 October 2026, 15:16:13 GMT (Europe/London)
> **Source path:** `docs/developer/ai-search-growth-and-buyer-questions.md` · **Status:** Current


`insightAiSearch.ts` composes retained assistant-source analytics, private-list daily evidence, citations and optional supplier series. `insightsPanel.ts`, `utils/insightPanel.ts` and `insightsRunAfter.buildPanel` maintain generated buyer prompts. These are distinct reporting and mutation paths; opening the growth report does not execute panel generation or provider purchases.

## Routes And Access

The growth route is `src/app/(dashboard)/app/insights/ai-search/page.tsx`, calling `insightsAiSearch`. Its tenant selector verifies a requested holding and restricts to OWNED, defaulting to the first company-owned holding. It passes no general selected-period parameter.

Buyer-panel UI is composed by `src/app/(dashboard)/app/sites/_components/useBuyerPanel.tsx` on the owned site's `ai/answers/page.tsx`. `sitePanel` checks `requireMySite` and OWNED, then projects saved panel and private-list membership. The query is read-only; synchronization and generation are internal after-week work.

`websitesOf` reads the owned shared website plus at most five `loadRivalHolds`. AI evidence uses `listHold(site)` and resolved site.place. Private question identity must remain separated from shared website facts; a shared hostname is not permission to inspect another company's selected prompts.

## Analytics Windows And Kinds

`aiSearchView` reads bounded history through `historyOf`, current company page kinds and whole source months through `monthsOf`. It aggregates sources whose `sourceOf` group is AI, merging by reconstructed assistant name. Monthly enquiries use stored conversion-derived figures rather than actual sales records.

The current comparison takes the last three held whole months; its local span helper checks length and membership but not independent calendar consecutiveness. Previous/year spans shift those month IDs and require matching held months. Guides must not silently promise contiguous quarter coverage when retained history has gaps.

Assistant rows union names across held monthly evidence. With no current comparison span, some per-assistant current fields can project zero while headline windows remain null. Missing baseline should therefore not be interpreted as a measured zero-growth interval. Page kinds use current classification over pages attributed to recognized assistant source names.

The general Insights period selector does not affect this query. Monthly source history, private answer window and optional provider months need not align. Downloads should retain those source/window distinctions rather than suggest one synchronized cohort.

## Private Answer And Citation Reads

The answer window begins at the first day of the current month shifted twelve months back. `askedQuestions` is bounded to two hundred question entries and expands prompt/engine/location context. `answersOf` reads up to four hundred `siteListAiDays.by_hold_site_day` records per website and aggregates asked, named and recommended by month/engine.

The since field is the earliest day encountered in that bounded read for the owned website. It is not a guaranteed all-history start. Monthly arrays do not preserve a versioned copy of every earlier private-list configuration.

Citations are read through `aiCitations.by_website_day`, newest first, at most nine hundred rows per website before SOURCE and current asked-context filtering. Thus matching private-list evidence can lie beyond the initial shared candidate window. A cut flag is set at the read ceiling and is conservative even when few candidates survive filtering.

Own cited pages normalize URLs to page identity, count retained events and collect engine labels, then return the fifty leading paths. Counts are neither unique full URLs in every case nor every citation ever produced by an assistant. Named, recommended, read and cited remain separate concepts.

## Optional Radar And Demand

Google Radar projection requires the brandRadar part and reads `brandRadarMonths.by_website_place` using site.place directly. Dedicated Radar readers country-normalize location. This difference can leave the growth series missing for a city-level place despite country-level Radar data existing. It is a documented source discrepancy, not an inferred provider outage or a reason to fabricate zeroes.

ChatGPT projection requires chatGptMentions and reads shared `chatGptRadarMonths.by_website`. This read does not repeat the United States country gate used by the purchase planner. Retained display, enabled module and eligibility for a new provider request are therefore distinct.

Demand requires aiDemand, joins `demandSearches` with saved AI volume and returns fifteen highest estimates with latest observed month. Its Google field is null in this projection. It is not a measured Analytics referral count or a promise that all rows share an identical provider observation month.

## Panel Input And Parsing

`panelInputs` reads up to three hundred holding pages and rank rows, selects twenty SERVICE pages and five titled ARTICLE guides, and draws useful known-volume searches from service/home paths. It skips LOST/unknown-volume rows, excludes configured brand-name matches and allows up to three searches per page before the forty-question bound.

The business name comes from the first readable configured brand or a host-derived fallback. A saved panel is due when absent or older than ninety days. `buildPanel` asks only when due and selected search inputs exist, then synchronizes the saved panel. The generation branch is not independently gated by buyerPanel in that helper; the switch governs list activation in sync.

`panelFrom` accepts twelve-through-three-hundred-character prompts, normalizes whitespace, deduplicates case-insensitively and caps forty. It derives NAME/SEARCH/GUIDE and withName. Despite comments suggesting known-source validation, an unknown builtFrom can survive with null volume; source-map membership is not a refusal criterion.

No nonempty parsed panel means the existing panel is not replaced by an empty new set through this action. Model generation uses the stored specialist execution path. No model was invoked during documentation review.

## Private-List Synchronization

`savePanel` pauses prompts present in the prior panel but absent from the new set, then replaces the current panel record. `syncPanel` reads saved prompts and the buyerPanel part. Off pauses matching rows; on activates them, then attempts missing additions through `addWebsiteQuestionCore` with normal validation/default engine/limit rules.

Matching is by prompt text in up to four hundred private list rows. It does not maintain an exclusive separate origin identity that prevents an identical manually entered prompt being paused or reactivated. A later sync can therefore reverse a manual pause on a current panel prompt while the module remains on.

Add errors are caught and counted as overLimit even when a refusal can have another reason. Existing matching rows are treated as available within that bounded set. This metric is a broad refusal count, not a precise quota diagnostic. Calls mutate list state but do not delete shared answer bodies as a side effect of pausing.

`sitePanel` reports WAITING when off, ASKING for an active matching row and OVER_LIMIT otherwise. firstAsked is the active row's createdAt; it is not the timestamp of an observed successful provider answer. The UI export labels should be interpreted with that limitation.

## Retention And Validation Evidence

`keepRules.ts` marks question panels LATEST. History, daily AI summaries, citations and Radar retain their separate bounds; replacing a panel does not provide a complete historic list snapshot or erase all shared evidence. The report stores no new growth-results table simply because it was opened.

`insightAiSearch.test.ts` covers assistant visitors/comparisons, answer evidence and cross-company refusal. Panel behavior is supported by source helpers and the existing question-core tests; this pass did not execute tests or claim a dedicated complete sync test suite. No browser, Analytics request, supplier purchase, model generation or live integration acceptance ran.

See [AI Questions And Answers](./ai-questions-and-answers.md), [AI Visibility Reports](./ai-visibility-reports.md), [Brand Radar](./brand-radar.md), [Insights Measurement And Enquiries](./insights-measurement-and-enquiries.md) and the [user guide](../end-user/ai-search-growth-and-buyer-questions.md). PRODUCT.md intent and section 33 cutover remain unchanged. Retained AI observations do not establish a complete causal journey to leads and sales.

## Refresh and evidence boundaries

The current section refresh notice is documented in [Insights Findings](./insights-findings.md#durable-refresh-recovery-and-source-generations). Buyer questions is an independently recorded stage, so a successful weekly analysis alone does not establish that the panel was rebuilt. Its saved prompt membership, a purchased answer and observed assistant-attributed enquiries are separate records with different times. Troubleshooting should identify which record is missing before proposing a sync, purchase or model run.
