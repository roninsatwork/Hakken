---
product: Hakken
documentation_type: Developer guide
feature_area: organic rank reports and compact projections
audience: backend and frontend developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/organic-keywords-and-pages.md
last_reviewed: '2026-10-26T11:00:56+00:00'
reviewed_against: current implementation
status: Current
---
# Organic Keywords And Pages Developer Guide

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** organic rank reports and compact projections
> **Reviewed:** 26 October 2026, 11:00:56 GMT (Europe/London)
> **Source path:** `docs/developer/organic-keywords-and-pages.md` · **Status:** Current

Organic reporting is built around shared website facts, a company-owned holding, compact list copies and bounded record enrichment. `convex/siteKeywords.ts` owns paged keyword/page/section and movement reads; `siteRecords.ts` owns keyword/page detail; `siteBands.ts` owns band summaries and moved-keyword lists. Filing and rebuild paths include `siteKeywordList.ts`, `siteRankings.ts`, `siteKeywordCopy.ts` and list-copy builders. The customer workflow is [Organic Keywords And Pages](../end-user/organic-keywords-and-pages.md).

## Routes And Shared UI

The principal routes are `/app/sites/[siteId]/keywords`, `/keywords/keyword`, `/keywords/pages`, `/keywords/pages/page`, `/keywords/bands`, `/keywords/bands/moved`, `/keywords/new-lost` and `/keywords/structure`, under the same website prefix. Record keys are carried by the existing record-link helpers rather than inferred from a page slug. `SiteKeywordsPage` uses `useSiteListPage`, `useSiteSort`, URL-backed filter/search state, shared `DataTable`, coverage notices, comparison controls and a dated position-band chart.

The client pager remembers twenty-five/fifty/seventy-five/one-hundred rows and asks the server for the selected page. Queries filter and sort the whole compact list before cutting it; this is not cursor walking through raw rank rows on every screen visit. `keywordsOnDay` enriches only displayed keywords, so the old-position column is deliberately absent from the compared view's sortable keys. A caller should not sort those displayed enrichments locally and present the result as a whole-list order.

## Authorization And Evidence Ownership

All reviewed public reads use `tenantQuery` and `requireMySite`. The route's `siteId` is an id in `companyWebsites`, not a shared `websites` id. `requireMySite` resolves that holding against the active company; an inaccessible holding is treated like an absent one. The selected place comes from the site context. Shared website facts may be reused across companies, but private tracked search/question reads must still use the company's holding through `holdLists.ts` and `listHold`.

A comparison request first checks that each keyword exists on the site's own organic rank list before reading its historical position. This avoids turning a guessed keyword into evidence that another company's private tracking created a position. Detail reads intentionally can combine an organic row with the caller's permitted tracking or first-check record. These are distinct sources: the existence of a detail response is not automatically proof of a current organic-list ranking.

## Tables, Copies And Indexed Reads

`siteKeywordRanks` holds the current per-website/place/keyword standing and extras. `by_site_keyword` supports point lookup, while page/band/position indexes support page-specific questions. `sitePageRanks` holds grouped page ranking facts with `by_site_page` and keyword-order indexes. Position history and supplier-derived feature/citation/crawl/link records are enriched through their owning modules instead of being copied wholesale into every query response.

`readKeywordCopy` decodes the compact keyword list and metadata including `rankingDay`, `latestCheckDay` and `previousCheckDay`. The tuple stores id, keyword, position, band, page, nullable volume, intent, status, change, day, difficulty band, CPC, estimated traffic and difficulty. The full displayed row is fetched only after the copy has selected the page. A copy is a read projection that needs rebuild lifecycle, not an independent source of truth to edit directly.

`pageOfList` clamps page and requested size to supported bounds and returns rows, total, shown page, page count, size, `cut` and `preparing`. Its total is exact for the list handed to it. It cannot prove the supplier returned every possible keyword or that an upstream truncated copy is complete. `preparingPage` returns an empty result with preparing true; the client should render preparation rather than a conclusive no-results state.

## Keyword Standing, Search And Sort

`listKeywords` resolves the site and copy, then applies standing, status, position band, intent, path and difficulty filters. Search uses `wordStartMatcher` on keyword text only, not on the URL. Sorting uses `listOrder` and the common `sortOrder.ts` policy: each key's preferred first direction, blank values last and stable name tie-breaks. Defaults prefer top position. Page selection happens after that complete filter/sort stage.

`keywordStanding` returns lost for explicit LOST or a null position, older for a nonlost row whose day precedes the latest check and current otherwise. This is deliberately more precise than declaring every row missing from a partial newest list lost. The movement API also supports LEFT for a record present at the prior check but omitted from a partially held new list. The list's What Hakken sees summary is computed over all current held keywords, not just the currently filtered page.

`keywordsOnDay` caps requested keywords at the Sites page maximum, verifies each against `by_site_keyword`, and asks `pointOnDay` for retained history. It returns checked and comparable flags alongside position/URL. Comparability checks the presence of the whole-page position convention against the current row. Earlier daily points can be represented by retained weekly/monthly data according to history rules. Do not fill a missing or incomparable point with zero, a current position or another company's tracking record.

## Page And Section Reports

`listPages` reads the pages copy and company page classifications concurrently. It filters on section/type and word-start matches of path only; custom classification takes precedence when present. It orders page, traffic, keyword count, best position or linking-domain figures, cuts the page and loads those full `sitePageRanks` rows. Missing source records can reduce returned enrichment rows without changing the copy's earlier total; the projection and source lifecycle therefore both matter when debugging a short page.

For AI citation enrichment, it obtains the caller's measured question/engine/place set and reads at most four hundred citation rows per displayed page before filtering to that set. That prevents unrelated question identities from being returned, but a bounded pre-filter read can undercount the caller's relevant citations. No returned citation or engine count is promised exhaustive beyond those read limits. Sections are separately grouped with a maximum-section bound; classification behavior is owned by the page-kind module rather than inferred from URL presentation.

`pageRecord` combines rank facts with available crawl, citation and backlink evidence. Constants cap citation reads at four hundred, displayed citing questions at twenty and linking-page examples at ten. These are detail examples, not a replacement for the owning paged lists. `keywordRecord` limits keyword input to two hundred characters, page input to two thousand, rivals to twelve and saved search-page results to one hundred. A missing retained full SERP can still produce a position-only fallback.

## Filing, Rebuild And Background Work

`fileRankedPositions` files dated observations per website/place/keyword and updates the current rank facts. Same-day observations use `setPoint`, so a newer reading replaces that day's fact rather than necessarily adding a new visible point. The function also inspects at most one thousand shared tracked-search records to refresh summaries when a ranked-list answer happens to contain tracked terms; company readers still read only their own private lists.

Full-list filing is chunked through internal mutations such as `writeListPage`, `writeListPositions` and `finishListPage`, with one hundred positions per write and bounded old-feature cleanup. Derived copies and page/day/AI rebuilds are requested through the ranking/rebuild machinery. This documentation describes that orchestration boundary, not a guarantee that every queued supplier answer is fully filed or every derived copy is current in a deployment. Collection retries, limits, job continuation and supplier quota behavior remain in the collection operations guide.

`siteBands` derives movement summaries from newest/previous held context, includes a small closest-to-page-one selection and bounds detailed moved rows. The closest selection holds ten examples around positions eleven through thirteen; detailed moved rows have a five-thousand ceiling and prior-day lookup is bounded. A ten-row example list or an exact count inside a retained copy should not be advertised as unlimited search-engine evidence.

## Effects, Configuration And Tests

The reviewed report routes are reads. They do not themselves purchase a supplier pull, mutate an external page, change a keyword's ranking or publish content. Record screens can link to separate tracking actions; those actions belong to their own authorization and queue contract. Location/plan/data limits come from existing site and collection configuration; report code does not embed provider credentials, and no environment value is needed in this guide.

Relevant source coverage includes `siteKeywordList.test.ts`, `siteBands.test.ts`, `sitePositionCounting.test.ts`, private website-tenancy guards and Sites pagination/sorting drift tests. This pass inspected source and test declarations rather than executing them. No paid call, Google request, data fill, browser, export or application gate was run. Documentation validation checks the new pair's metadata, length, evidence paths, relative links and whitespace.

When diagnosing a discrepancy, record hold id and company, place, copy metadata dates, requested filters/sort/page, source-row availability and history comparability. Do not repair a customer display by reading a shared private-list table directly or marking an older omitted term lost without the actual evidence rule. A report is implemented behavior; it does not establish that every planned Hakken product outcome or live integration acceptance criterion has been completed.

## Full-Table Export Boundary

`TableDownload` calls `siteExports.exportSiteTable` with site, report kind and optional sort/direction only. Search and screen filters are not passed. The tenant action derives company identity, pages through the internal export reader and enforces shared row and byte limits. It returns CSV, row count and `complete`; the client downloads the text and shows a cut-short notice when incomplete. Sorting is applied to the retained export rows. Do not describe Download all as an export of the currently filtered subset or as an unlimited provider archive.
