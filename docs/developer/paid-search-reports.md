---
product: Hakken
documentation_type: Developer guide
feature_area: paid search reporting
audience: developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/paid-search-reports.md
last_reviewed: '2026-10-26T11:42:27+00:00'
reviewed_against: current implementation
status: Current
---
# Paid Search Reports

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** paid search reporting
> **Reviewed:** 26 October 2026, 11:42:27 GMT (Europe/London)
> **Source path:** `docs/developer/paid-search-reports.md` · **Status:** Current

Paid search is a read projection of advertisements separated from the existing domain ranked-keywords response. `convex/sitePaid.ts` files and lists those rows. The frontend overview reads shared site-series evidence, and the keyword page reads the bounded current paid list. No campaign creation, bid editing, account-authenticated spend retrieval or public advertising write is implemented by these handlers.

## Entry Points And Scope

The customer routes are `src/app/(dashboard)/app/sites/[siteId]/paid/page.tsx` and `paid/keywords/page.tsx`. The overview calls `siteCharts.siteSeries` using the shared date range and step. The list calls `sitePaid.listPaidKeywords` through `useSiteListPage`, with debounced search, sort and direction. Row navigation uses the shared keyword-record route rather than an ad-account record.

`listPaidKeywords` is a `tenantQuery` and calls `requireMySite`. It scopes reads by the resolved shared website ID and `site.place`. Owned sites and held competitors can use this evidence without accessing another company's private advertising credentials. Website identity alone is not sufficient access; the company holding is still required.

No external fetch occurs in the report read. Collection and provider transport remain in the established DataForSEO pipeline. A report displaying data proves that saved evidence was read, not that a new request ran, every scheduled request succeeded or a deployed provider integration has current acceptance evidence.

## Parsing And Operation Boundaries

`dataForSeoRegistry.ts` defines `domain_ranked_keywords` as a live Labs operation with default limit one hundred and estimated-traffic descending order. Live here describes the supplier operation mode used by collection. It does not mean every frontend query is a live call to the supplier.

`dataForSeoParsers.ts` inspects the ranked result's item type. A paid item enters `paidPositions` with available absolute position, URL, keyword search volume, CPC, estimated traffic and estimated paid traffic cost, then skips organic filing. Other result features are also kept separate. This prevents an advertisement from being counted as an unpaid organic ranking.

The parser derives paid headline metrics from the response's paid aggregate: paid-keyword count, estimated traffic and estimated traffic cost. Those aggregate facts can concern more searches than the returned detailed sample. A routine response's hundred rows are not an inventory of every advertisement known to the supplier.

`seoCollectionParse.ts` caps supplied paid positions at `MAX_POSITION_ROWS`, one thousand. Its filing mutation invokes `filePaidKeywords` only for the domain ranked-keywords operation when the optional paid array is supplied. An empty supplied array is significant because it can replace the old current list with no paid rows; omission and an empty result are different conditions in that path.

## Table Shape And Current-List Replacement

`siteSchema.ts` declares `sitePaidKeywords` with website, location, pull and day identity, normalized keyword, optional position and URL, page path, optional volume/CPC/traffic/cost and search text. Its `by_site_traffic` index uses website, location and traffic. This is current detailed evidence, not a row-version table with every previous advert.

`filePaidKeywords` reads up to fifty newest domain-ranked-keyword metric rows, then selects an applicable location or unspecified-location record. A newer day prevents an old response from replacing current paid rows, even if the newest response contained no advertisements and left no paid row to compare against. The bounded metrics scan is part of that guarantee's practical limit.

It then reads up to 1,100 current rows at the website/place. A newer row day also prevents replacement. Otherwise those held rows are deleted and valid normalized incoming keywords inserted. Missing supplier values are omitted, rather than written as measured zero. The cleanup is bounded; it is not a generic unbounded repair for an arbitrarily large corrupt table.

Replacement checks compare day strings, not a distinct within-day filing timestamp. Multiple accepted same-day responses can replace one another. Do not describe the guard as an exact most-recent-response arbitration within a day. The table represents the accepted current answer under those rules.

## List Reading, Sorting And Summaries

`listPaidKeywords` reads 1,101 rows through the website/place traffic index, retains 1,100 through `heldTo` and carries the cut flag into `pageOfList`. It applies `wordStartMatcher` to keyword and page, orders the full retained candidate set using `listOrder`, then slices the requested page. The returned total is exact for that bounded filtered set, not the supplier's larger paid-keyword headline.

The default sort is traffic. Explicit heading sorts include alphabetical keyword, ascending position and descending volume, CPC, traffic or estimated cost as their first direction. Nullable projection preserves unknown values. Shared page arguments and footer controls implement Sites page sizes rather than admin table defaults.

The query builds `paidKeywordsSees` from all held rows, independent of the search filter. Its summary can consequently refer to a row outside the visible matches. The helper totals known traffic-cost estimates, selects a highest-cost example and optionally a distinct strongest-traffic example. Missing estimates contribute nothing to that sum, which must not be described as a complete observed spending ledger.

The keyword screen compares an unfiltered returned total with `site.counts.paidKeywords` and displays retained-versus-reported context when the latter is larger. A nonempty search suppresses that comparison because the matched table total is not an equivalent coverage measure. An empty list with a positive reported count receives different wording from an ordinary empty observation.

## Overview Time And Missing Observations

The overview filters shared series points to those with a defined paid-keyword count. It uses the last such point in the selected interval and shows that evidence day. Selecting a historic interval can make the headline historic even if newer records exist elsewhere in storage.

The no-advertising explanation requires an actual latest point with paidKeywords equal to zero. No point does not establish no advertising. The check is source/time scoped; neither the UI nor parser proves absence across every country, ad format or advertising platform.

Checkboxes select paid keywords, traffic and cost lines. The chart CSV follows selected measures and returned points. Changing those checkboxes is a local display operation. Do not connect it to collection purchases, external advertising account settings or model configuration.

## Exports And Financial Meaning

`siteExports.exportSiteTable` accepts site, export kind and optional sort/direction. It does not accept keyword search text, so the paid download is not filtered to the current search box. Its internal `exportPage` checks tenant website scope and paginates `sitePaidKeywords` for the resolved website/place. Headers include keyword, advert position, volume, CPC, visits, estimated cost, landing page and last checked.

Export applies configured `rowsPerDownload` and a six-million-byte ceiling, returning `complete` and row count with the CSV. The export path can cover a different retained set than the bounded screen candidate window. Completion concerns the supported export, not universal supplier completeness. Preserve warnings and estimate labels in any downstream handoff.

The displayed dollar estimates come from supplier metrics. They are not Stripe revenue, company billing charges or authenticated Google Ads spend. These code paths neither charge an advertising account nor verify conversions. Product discussions should distinguish source estimates, actual Hakken collection cost and actual customer advertising cost as separate quantities.

## Retention And Validation Evidence

`keepRules.ts` marks `sitePaidKeywords` as LATEST. Historical aggregate series follow their own site-metric storage paths; current detailed replacement does not create a full advertisement-history archive. This explains why a historical chart can show earlier activity that is absent from the current paid list.

`sitePaidCrawl.test.ts` verifies paid/organic separation, extracted aggregates, newest-list replacement, old-result refusal after advertising stops and cross-company rejection. Shared sorting and export tests cover adjacent mechanisms. Their source was read during this pass; no tests, application, browser or paid provider calls ran.

See [Organic Keywords And Pages](./organic-keywords-and-pages.md) for adjacent unpaid evidence, [Collection Operations](./collection-operations.md) for sending and filing, and the [user guide](../end-user/paid-search-reports.md) for report interpretation. PRODUCT.md section 33 remains the external rename-cutover checklist. Implementation and local tests do not demonstrate that renamed credentials, callbacks or deployed services are functioning in production.
