---
product: Hakken
documentation_type: Developer guide
feature_area: Insights measurement and enquiry attribution
audience: developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/insights-measurement-and-enquiries.md
last_reviewed: '2026-10-26T15:13:08+00:00'
reviewed_against: current implementation
status: Current
---
# Insights Measurement And Enquiries

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Insights measurement and enquiry attribution
> **Reviewed:** 26 October 2026, 15:13:08 GMT (Europe/London)
> **Source path:** `docs/developer/insights-measurement-and-enquiries.md` · **Status:** Current


This guide covers the retained period foundation, latest measurement checks and enquiry/source projections. `insightsPeriod.ts`, `insightsPeriodData.ts` and `utils/insightPeriods.ts` implement period reads. `utils/insightMeasurement.ts`, `insightsReading.measurementInternal` and `insightsReads.insightsMeasurement` implement saved measurement. Funnel/page experiments and AI-search growth are separately inventoried rather than assumed covered by this guide.

## Access And Route Scope

Routes include `src/app/(dashboard)/app/insights/measurement`, `enquiries` and `enquiries/source`; Summary consumes the period view. `insightsPeriodView`, `insightsEnquiries` and `insightsEnquirySource` are tenant queries. `siteFor` checks a supplied holding and restricts to company-owned sites, preferring the first with any insightHistory when no site is selected.

The measurement reader instead uses `sitesFor` and the first selected/eligible owned site. It reads `insightMeasurements.by_hold`, returning saved week/checks/byDay or null measurement. This is not the same default-selection algorithm as period history. No frontend read triggers Google collection or modifies conversion settings.

## History And Period Eligibility

`insightsPeriodData.historyOf` reads at most two hundred `insightHistory.by_hold_kind_month` records per requested kind when kinds are supplied; its generic form caps the whole read at two hundred. Period views request GA_SOURCES, GA_PAGES, SC_PAGES, GA_MONTHS and DAYS; source detail requests GA_SOURCES and GA_PAGE_SOURCES. This avoids reading unrelated large history kinds but remains bounded. `pageKindsOf` resolves current company classifications, recognizes missing/not-recorded paths and applies a trailing-slash fallback for appropriate unsorted paths. Historic evidence can consequently be regrouped under current labels without rewriting the saved source events.

`monthsOf` builds monthly source, page and Search Console summaries. A month is whole when its GA_SOURCES record spans the first to last calendar day. Other datasets are not thereby certified complete. Site Search Console figures require all expected daily observations in that month; page totals and site totals have distinct source coverage.

`periodsFrom` offers whole months, complete three-month calendar quarters and the latest twelve consecutive whole months. Invalid/unheld choice falls back to `openingPeriod`, the newest whole month. `heldWhole` requires every prior-span month; `yearAgoOf` returns no separate year-ago span for a twelve-month selection.

People is projected only for a single month when available, avoiding sums of monthly unique people across a long span. Visits and enquiries use their stored aggregation rules. Missing comparison spans remain null, while absent categories inside an otherwise held span can contribute zero. Those semantics must not be collapsed into one generic missing-equals-zero rule.

`insightHistory.saveHistory` replaces kind/month records and removes months older than its rolling retention boundary from a bounded read. `keepRules.ts` declares sixteen months. Expiry is save-triggered; the reader bound and whole-span records remain separate lifecycle facts. The fetch action can contact source APIs, but none was invoked for this documentation review.

## Counting Break And Why Projection

`countingBreak` looks for an impression ratio no greater than 0.65, clicks held between 0.8 and 1.25 of prior and average-place improvement of at least five. It can move the boundary to a following month when a half-transition produces another large place change. This is a heuristic detector, not authoritative confirmation of a specific Google policy change.

`periodView` builds the chosen current, previous and year spans, grouped source/page evidence and latest saved week context. When comparisons cross an inferred counting boundary, impression/place comparisons can be withheld. Period-end page-one evidence comes from retained site series, with a current snapshot fallback where applicable.

`clarityBeside` uses up to thirty-one retained daily entries and requires seven common nonzero-Clarity days to compare with Analytics. This is a bounded corroborating observation, not an automatic full independent audit. Missing corroboration should remain unknown rather than a passed test.

`utils/insightWhy.ts` evaluates COUNTING, MARKET, RANKINGS, SHOWN, SOURCES and CONVERSION. The arithmetic split models counting ratio, visitor change and rate change, with rounded components adding to the observed enquiry difference. Thresholds include a tenth for meaningful movement, two places for ranking change, thirty-percent source decline with at least five earlier visits and fifteen-percent rate decline.

Verdicts include likely, part, watch, ruled out and no data. They are rule outputs, not causal identification. Market uses competitor estimates plus comparable service impressions; conversion includes service-page context. A saved analyst paragraph is reused only for matching period/comparison; selecting a different interval does not itself make a paid model request.

## Measurement Checks And Source Reuse

`measurementFrom` emits ten named checks with LOOK, LIMIT, UNKNOWN or PASSING. Analytics health is reused for never-firing/uncounted enquiry events, missing values/pages, stopped or fallen tracking, self/payment referrals and unexpected hosts, with fallback logic for older health shapes. It does not rerun those checks live on every query.

Enquiry counting considers `EnquiryCheck` problems and counted annual event facts. With fewer than twenty events it can remain unknown despite no identified duplicate issue. The uncounted-event fallback uses enquiry-like names occurring at least ten times. A naming heuristic does not justify changing a business's conversion definition automatically.

Google agreement compares retained sc.clicks.90.now and Organic Search visits with a twenty-percent tolerance. Page-linked clicks at least ninety percent are passing, below that a LIMIT. Missing/zero required denominators produce UNKNOWN. Values are evidence rules rather than proof of a verified tagging defect.

`measurementInternal` reads connected saved Analytics health, determines the newest day common to Analytics and Search Console and joins up to fifty-six days. It reads at most fifty-eight channel-day parts and returns only days represented in both. `saveWeek` replaces latest measurement when supplied; no new measurement input does not prove a prior stored one was cleared.

## Enquiry, Event And Page Projections

`enquiriesView` uses the same whole-month selection and prior baselines, then `listsOf` to combine retained source/page/event records. Sources and pages start from keys present in the current span and are capped at one hundred fifty after ordering. Events union keys across compared spans and order counted-like positive-enquiry contributors first.

The returned event counted flag is derived from positive enquiry contribution in any compared span. It is not the live configuration boolean for an enabled event that never fires. Pages carry current classifications and a Google/AI/typed/other breakdown from saved source/page evidence. UNKNOWN/not-recorded classifications should not be silently excluded.

`sourceOf` maps source/channel keys into Google, AI, other search, direct, referrals, social and other groups, recognizing configured assistant names. `enquirySourceView` matches the reconstructed source name across possible channel keys, returning headline trios, all whole-month observations, kinds and up to one hundred fifty pages. No matched source yields a missing chosen result rather than fabricated traffic.

## Journey And Search Estimate Windows

The journey panel uses the retained GA_JOURNEY record and its own from/to, choosing positive-enquiry rows and capping one hundred fifty. It is aggregate page evidence, not a sequence of identified personal sessions. It is not automatically sliced to the selected whole-month period.

Search estimates use the newest three whole months, independent of the page's selected span. SC_SEARCH_PAGES query/page pairs are joined to Google enquiries by landing page. The denominator is the maximum of known query-pair clicks and all retained page clicks, preserving private queries' unallocated share where those totals are available.

The estimate rounds page Google enquiries times query click share to one decimal. The sure flag requires at least three page enquiries and a quarter click share; it is not a statistical interval. Pages without retained Google enquiries populate a separate no-enquiry list. Both lists cap one hundred fifty and do not prove direct keyword-to-customer attribution.

The chosen main period, saved journey window, newest-three-month estimate and latest measurement week can therefore differ on one screen family. CSVs and summaries should retain those labels instead of presenting a synchronized universal funnel.

## Verification And Adjacent Work

`insightsPeriod.test.ts` covers whole-month aggregation, inferred counting changes, source/event/query estimates and source detail. `utils/insightMeasurement.test.ts` covers passing, insufficient and missing evidence, older health fallbacks and reuse of Tracking health. `utils/insightWhy.test.ts` covers the explanatory rules. These sources were read, not executed.

No application, browser, source fill, test enquiry, migration, Google call or model action ran. See [Google Analytics](./google-analytics.md), [Search Console](./search-console.md), [Insights Reports And Exports](./insights-reports-and-exports.md) and the [user guide](../end-user/insights-measurement-and-enquiries.md). PRODUCT.md intent and external cutover acceptance remain separate from these local implemented projections.
