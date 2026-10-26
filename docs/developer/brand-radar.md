---
product: Hakken
documentation_type: Developer guide
feature_area: Brand Radar and AI Overview gaps
audience: developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/brand-radar.md
last_reviewed: '2026-10-26T15:13:08+00:00'
reviewed_against: current implementation
status: Current
---
# Brand Radar

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Brand Radar and AI Overview gaps
> **Reviewed:** 26 October 2026, 15:13:08 GMT (Europe/London)
> **Source path:** `docs/developer/brand-radar.md` · **Status:** Current


Brand Radar stores supplier AI-mention totals, a current bounded question/source sample and monthly series. The customer overview, cited-source and detail projections use Google records; AI Overview gaps uses separately retained search-result evidence. A distinct ChatGPT aggregate path is implemented without storing its question detail in the Google tables. This guide preserves those differences rather than describing every AI surface as one dataset.

## Entry Points And Access

Routes live below `src/app/(dashboard)/app/sites/[siteId]/radar/`: index, `question`, `sources`, `sources/website` and `gaps`. The main queries are in `siteBrandRadar.ts`, source/question details in `siteRadarDetails.ts` and gaps in `siteAiOverviewGaps.ts`. Each starts with `requireMySite` in a tenant query; detail input does not initiate a provider request.

`readings` resolves `groupOwner`, converts `site.place` with `countryCodeOf` and reads the owned website plus bounded watched rivals. `radarRivals` queries company holds against that owned website and filters tracked holdings. The private group is scoped by company even though the underlying provider facts are shared per website/country.

`holdQuestions` through `listHold` supplies the tracked marker. The marker checks prompt membership case-insensitively within its bound, not an active-only recurring-collection guarantee. Track actions are shown to SUPER_ADMIN and invoke `websiteCanonical.addWebsiteQuestion`, whose existing super-admin validation and prompt limits remain authoritative.

## Planning And Country Contracts

`brandRadar.radarSteps` skips tracked holds and companies whose `brandRadar` part is off. It plans owned and bounded rival hosts using resolved question limits and thirty-day period keys. `dataForSeoRadarOperations.ts` declares `radar_mentions` on `/v3/ai_optimization/llm_mentions/search/live`, default limit two hundred, platform google, country-converted location and English.

`chatGptRadarSteps` additionally requires `chatGptMentions` and `chatGptCovers`; the implemented eligible country is 2840, the United States. Parameters use platform chat_gpt and that country. This is the repository's guard, not a claim that provider coverage cannot change. Changes to the guard require their own evidence and source authorization.

The target is an array containing a domain, declared through the text-parameter registry path to avoid treating this optional module as mandatory generic host collection. Collection owns operation lookup, reuse, costs, sending and failure handling. No provider request or contemporary price lookup was needed to document the local code.

## Parser And Shared Names

`parseRadar` reads supplier total_count independently from retained items. It deduplicates question text case-insensitively, extracts AI search volume with a zero default and detects first brand occurrence in answer text through `findBrandMentions`. It keeps at most ten unique source URLs per question. The complete answer text is used for detection but not written into the Radar question table.

`fileRadarPull` reconstructs target host and resolves shared website identity. Brand names come from a bounded two-thousand named-website listing, falling back to the host's first word. That is shared website evidence influenced by configured names, not a distinct parser result privately recomputed for each viewing company.

Google filing uses sent location, run-day month, total, parsed items and pull ID. ChatGPT filing instead writes only mentions and summed retained-item asks to its separate monthly series. Parse errors are recorded through `seoCollectionParse.recordParseFailure`; an absent target is invalid rather than grounds to guess a different website.

## Packed Tables And Replacement

`radarSchema.ts` defines `brandRadarQuestionParts` and `brandRadarMonths` indexed by website/place, plus `chatGptRadarMonths` indexed by website. Question parts store current month, total, question strings, packed volume and first-offset columns, a deduplicated source-page dictionary and packed starts/source indices. `questionsOf` reconstructs each question's source URLs from those offsets.

`writeRadar` inserts or replaces the current part when its month, total or semantic packed content changes. The equality check omits pull ID and timestamp, so an otherwise unchanged replay need not rewrite the source reference. The writer has no explicit newer-month refusal: an older reparse can replace the current detail sample. Do not describe it as monotonic latest-by-month arbitration.

Monthly figures store supplier total as mentions, sum of retained question volumes as asks and distinct own-host URLs as pages. Existing months are replaced, new months inserted and sorted, then limited to the newest thirty-six. The ChatGPT writer uses the same rolling month count for its own series. `keepRules.ts` calls these histories retained forever, but executable writers cap them; that documentation/source-label discrepancy requires explicit limits in guides.

The question table is LATEST, so older series points do not preserve their question/source lists. Full answer bodies and unlimited source lists are not recoverable from these packed records. Replaying raw provider results is separate operational work with its own authorization and side effects.

## Overview Counts And Ordering

`radarOverview` displays a union of at most twelve months across the group. Each business's headline uses its own latest month and previous available month, which need not align exactly with another business or be adjacent calendar months. Missing series points remain null rather than measured zero.

Questions merge case-insensitively across current readings. Named businesses are ordered by their stored first character offsets, producing a group-relative place. These offsets can originate in separate website-targeted answer samples; the resulting order is an implemented comparison heuristic, not a universal AI recommendation rank. A null offset does not create a ranked row.

The overview's own cited-answer count increments when an own reading question has an own-host source page. `pagesCited` counts distinct own URLs. Headline mentions remains the supplier total; asks covers retained item volume. These denominators differ and should not be presented as a complete common universe.

`perCheckUsd` comes from the owned part's referenced pull cost when positive. It is a recorded pull cost, not a configured fixed customer tariff or the combined price of every group request. Equality-preserved pull references and separate collection history can matter when diagnosing a changed cost notice.

## Source And Detail Queries

`radarSources` groups unique source URLs per question reading by exact normalized host, increments page occurrence counts and tracks whether the reading belongs to the own site or a rival. It classifies host kind, counts distinct rivals and returns five leading pages. A times count is not deduplicated across the entire business group or all question observations.

`siteRadarDetails.websiteDetail` normalizes a supplied host, then counts exact-host source occurrences from authorized readings. It joins `linkGapOf` and `shownMentionsOf` for rival linking and own naming context. Its own-host/subdomain classification can be broader than exact citation aggregation, so a mobile host remains a separate cited row while still classifying within a familiar source family.

`questionDetail` searches current readings case-insensitively, uses maximum matching volume, unions source URLs and orders named businesses by first offset. It retains an own-business null row when not named and reports found false if no current reading holds the question. Suggested actions depend on these retained observations; they do not create content or external listings.

## AI Overview Gaps

`siteAiOverviewGaps.readOverviews` reads active `holdSearches` through `listHold`, bounded by MAX_LIST. It queries current and at-or-before-thirty-days-ago `serpOverviews` at keyword/place, alongside `siteKeywordRanks` for `listWebsiteId`. Missing current overview records are omitted from returned rows; the searches field therefore counts readable checks, not the full private list.

The query joins volume from known keyword ranks or stored volume, marks whether the website appears in cited domains and projects at most three domains with the own host first. Earlier quoted count is nullable until any baseline exists, then sums only available baseline checks. It is not a guaranteed matched complete cohort across both dates.

The gaps screen filters to overview-present rows, then emphasizes not-cited searches within its defined top organic-rank threshold. Its downloads and table filters use those supplied rows; no extra Radar or Google request is purchased. This search-evidence report is separate from the monthly supplier question sample despite sharing navigation.

## Validation And Adjacent Work

`brandRadar.test.ts` covers parsing, parameter reconstruction, packed replacement/no-change behavior and the separate United States ChatGPT planning/series path. `siteRadarDetails.test.ts` covers source counts, ordered named businesses, derived guidance and missing current questions. `radarLoad.test.ts` covers report read budgets. Their source was read; no automated gate, browser or live provider test ran.

See [AI Questions And Answers](./ai-questions-and-answers.md), [Web Mention Monitoring](./web-mention-monitoring.md), [Collection Operations](./collection-operations.md) and the [user guide](../end-user/brand-radar.md). Advanced Insights uses additional aggregate evidence documented in its linked specialist guides. Local records and tests do not establish live external rename-cutover acceptance under PRODUCT.md section 33 or delivery of the planned Hakken product surface.
