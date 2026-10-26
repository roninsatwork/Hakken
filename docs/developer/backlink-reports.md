---
product: Hakken
documentation_type: Developer guide
feature_area: backlink projections, packed groups and filing
audience: backend and frontend developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/backlink-reports.md
last_reviewed: '2026-10-26T11:20:21+00:00'
reviewed_against: current implementation
status: Current
---
# Backlink Reports Developer Guide

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** backlink projections, packed groups and filing
> **Reviewed:** 26 October 2026, 11:20:21 GMT (Europe/London)
> **Source path:** `docs/developer/backlink-reports.md` · **Status:** Current

Backlink reporting separates supplier summary metrics, detailed/representative backlink passes, packed referring-domain/anchor/IP groups, historical weekly changes and compact list projections. `siteLinks.ts` owns profile and supplier-list totals, `siteLinkLists.ts` paged list reads, `siteLinkRecords.ts` domain/anchor detail and `siteLinkFiling.ts` parsed-answer persistence. `siteLinkWeeks.ts`, `siteReferringDomainParts.ts` and `siteLinkGroupParts.ts` store compact grouped evidence. The customer workflow is [Backlink Reports](../end-user/backlink-reports.md).

## Routes And Read Authorization

Routes under `/app/sites/[siteId]/backlinks` include the overview, all, domains, domains/domain, anchors, anchors/anchor, ips, quality, where, new-lost, broken and compared. Public queries use `tenantQuery` and `requireMySite`. A route id is a company holding, resolved against the active company before shared website facts are read. These queries are read projections; no source-page fetch, external link removal or site repair is performed by opening a report.

Comparison uses `siteCharts.siteAndRivals` and the caller's held group, not an arbitrary company or hostname argument. Current backlink facts can be globally reusable for a website while the set of competitor holdings remains company-owned. Preserve the holding check even when a particular table row is not itself tenant-keyed.

## Profile, Totals And Data Model

`linkProfile` reads the latest `seoWebsiteMetrics` row for operation backlinks_summary through `by_website_operation_day`. It parses the metrics JSON defensively, maps absent numeric values to null and malformed breakdowns to empty lists. Rank, backlink/referring-page/domain/IP/subnet counts, spam and distribution attributes therefore share that observation's date, not necessarily a detailed list's newest date.

`linkListTotals` maps each list type to its operation, reads at most thirty metric rows per operation and uses the maximum reported listTotal among the newest day's pages. A missing total remains null. This is a supplier-reported total, distinct from the number of rows held after configured collection bounds or a filter. Do not substitute one for another to make a footer look exact.

`siteBacklinks` stores source/destination, anchor, follow state, ranks, observed dates, status and pass identity. Passes distinguish ONE_PER_DOMAIN, BROKEN and ALL. `by_site_pass_rank`, `by_site_pass_domain`, `by_site_pass_anchor` and a search index support list/detail reads. Packed referring-domain, anchor and IP parts avoid repeatedly reading bulky individual supplier rows. `siteLinkWeeks` stores link/domain gains and losses as packed weekly figures.

## Paged Backlinks And Filter Semantics

`listBacklinks` chooses a representative raw-row path when every is false or group/change filters are present. It reads at most 2,501 rows through the ONE_PER_DOMAIN rank index, keeps 2,500 with a cut flag, reconciles overlapping lists through `newestPerKey`, then filters/sorts/pages. Even an every=true request uses this path when narrowed by a breakdown or date-change interval. Document that scope rather than promising an unlimited filtered ALL-pass scan.

Unnarrowed every-link mode reads the links compact copy, returns preparing when absent, decodes light facts and narrows/orders the whole copy before paging. Full records are loaded only for selected ids. A deleted source row can shorten the enriched response without changing the earlier copy total. `cut` comes from the copy. The What Hakken sees context differs by query: some summarize filtered rows while other group queries summarize the held set before search.

`narrowLinks` applies word-start matching, state/follow filters and shared list ordering. Breakdown groups use country, domain ending, platform, item type or attributes. Change filtering reads firstSeen or a LOST row's lastSeen under the selected interval; it is not a live publisher event stream. All sort keys must be available over the held candidate list before `pageOfList`, with blanks/ties following the common sort rule.

`listBrokenBacklinks` uses the BROKEN pass with the same 2,500-plus-sentinel bound and deduplication strategy. It exposes the saved target response code, not a fresh HTTP check. A caller should not synthesize a healthy/broken outcome when a field is absent or a source row was not retained.

## Referring Groups, Networks And Details

`listReferringDomains`, `listAnchors` and `listReferringIps` read packed groups, apply the 2,500-group ceiling, reconcile newest lists and then filter/order/page. The domain NOFOLLOW filter means nofollowPages is greater than zero. It is not an all-links-nofollow assertion. Search is specific to each group's fields rather than a global substring search over every backlink.

`topSubnets` exposes at most fifteen strongest subnet examples from bounded server/group reads. Those are grouping records, not verified ownership relationships. The screen may keep aggregate IP/network totals from a separate summary operation, so absence of an example is not a measured zero.

`linkingWebsiteRecord` truncates a domain key to five hundred characters and looks for its exact or nearest parent aggregate. Link examples use indexed exact-domain rows plus a bounded two-hundred-and-fifty-six-candidate search for subdomains, then retain at most fifty in the selected pass path. Search matching is confirmed with the host relation before returning subdomain examples. It does not fetch or verify those websites live.

`anchorRecord` similarly limits its key, reads the packed anchor aggregate and up to fifty matching links in a pass path. An empty anchor is mapped to the absent stored anchor field. The shared detail helper selects available link passes; these examples are not guaranteed to enumerate every link represented by an aggregate count. Keep null aggregate, empty links and partial examples distinct.

## Filing And Replacement Lifecycle

`fileSiteLinkPull` dispatches parsed backlink operations to internal write handlers. Individual backlink rows are written in batches of two hundred, old raw rows cleared in pages of four hundred and packed parts cleared through bounded work. List metadata identifies day, pull, offsets and coverage. A newest complete replacement is not equivalent to the first page of a newer partial answer.

The standing-list logic keeps usable previous coverage while a replacement is assembled and avoids replacing it with a shorter incomplete purchase. `hasNewerList`, recorded page reach and newest-pull checks protect against replaying an older response over current data. `newestPerKey` lets reads prefer a newer list while retaining older rows for keys it did not replace, without confusing identical keys across different list generations. This is a bounded reconciliation strategy, not a promise that every malformed duplicate history is repaired.

`writeLinkChanges` stores the weekly gained/lost values. `linkChanges` filters held weeks by requested dates and sums them into the selected day/week/month buckets. A bucket labelled as a day does not establish an observed event on every day when the underlying record was weekly. Historical summary filling only supplements the days permitted by the existing lifecycle; a read query does not manufacture new provider observations.

## Exports, Retention And Side Effects

The shared `siteExports.exportSiteTable` action validates company/site scope and exports the selected report kind with optional order. Table search and screen filters are not included in that action's arguments. Row and byte limits can return complete=false and the client displays a cut-short message. Do not describe it as a full filtered provider archive or silently suppress incomplete coverage.

`keepRules.ts` treats current backlink/group lists as LATEST replacement data and weekly link-change history as retained history. That declaration is not proof of a comprehensive company-removal cascade or external supplier deletion. Individual list refreshes can remove old derived rows without deleting all related historical figures; explain the owning lifecycle before proposing cleanup.

No report query itself queues a provider request, deletes an external link, repairs a target response or makes an outreach decision. Collection limits, supplier quotas, job retries and credit recording belong to their established services. The report code does not require credentials in documentation, and no credential values were read or printed for this pass.

## Tests And Troubleshooting

Relevant tests include `siteLinks.test.ts`, `siteLinkFilters.test.ts`, `siteLinkGroupParts.test.ts` and `siteReferringDomainParts.test.ts`. They cover complete-list replacement, pagination/counts, private hold checks, word-start matching, weekly history and packed group readback. Source declarations were inspected; no test, app, browser, export, collection or external-link request was run.

For a mismatch, identify holding/company, pass, operation and saved day, reported versus held total, copy presence, active narrowing and cut flags. Do not remove tenant checks or widen a paid data fill to make a table total match a larger supplier headline. Current source support does not prove deployed integration acceptance, external rename cutover or delivery of all planned Hakken product outcomes.
