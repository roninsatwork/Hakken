---
product: Hakken
documentation_type: Developer guide
feature_area: technical site audit
audience: developers
source_repository: roninsatwork/Hakken
source_path: docs/developer/technical-site-audit.md
last_reviewed: '2026-10-26T11:27:06+00:00'
reviewed_against: current implementation
status: Current
---
# Technical Site Audit

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** technical site audit
> **Reviewed:** 26 October 2026, 11:27:06 GMT (Europe/London)
> **Source path:** `docs/developer/technical-site-audit.md` · **Status:** Current

Hakken's technical audit is a retained DataForSEO crawl summary with separately filed page and broken-link details. The customer report reads those records; it does not start a crawl, fetch a page on demand or modify a website. This guide covers the current operation, parser, filing steps, tenant queries and report boundaries. It documents implemented foundations without declaring the planned Hakken product surface delivered.

## Entry Points And Product Boundaries

The overview route is `src/app/(dashboard)/app/sites/[siteId]/audit/page.tsx`; its problem detail is `audit/problem/page.tsx`. The overview combines the latest audit with historical series, supports issue filtering and sorting, and creates a local CSV of the selected issue rows. The selected check is passed to the problem route, which reads page examples rather than the supplier directly.

The overview displays `CompetitorNotCollected` for a tracked competitor. Queries are set up before that early return. Backend `siteAudit` and `crawlProblemPages` require a company holding through `requireMySite`; that ownership-of-access check should not be described as an explicit owned-site-only check. Do not infer a stronger authorization guarantee from a frontend explanation. Buying eligibility and retained shared evidence are distinct concerns.

`convex/siteCrawl.ts` implements summary parsing, `fileSiteCrawlPull`, `writeCrawl` and the `siteAudit` tenant query. `convex/siteCrawlDetail.ts` implements internal lookup, fetching, chunked writes, older-detail cleanup and problem reads. `convex/dataForSeoCrawlOperations.ts` declares the provider operation. These modules are the primary evidence for the behavior below.

## Operation And Completion

The `site_crawl` definition is queued, posts a task to `/v3/on_page/task_post` and reads its summary through the task-result path. Its configured refresh interval is thirty days, JavaScript is enabled and `max_crawl_pages` defaults to one thousand. These defaults do not establish the actual age or page allowance of an individual stored result.

`isCrawlUnfinished` checks the crawl-progress field; a response whose first crawl result has not reached `finished` stays unfinished rather than being filed as a complete audit. Collection orchestration owns purchase, waiting and cost handling. Audit reads must remain passive consumers of saved evidence, rather than bypassing those workflows to make extra supplier requests.

Credentials are resolved by the existing DataForSEO action path. This documentation review neither read credential values nor ran that path. Provider pricing comments are not a current price contract; use the configured operation and the recorded purchase/cost evidence when investigating a real authorized run. Do not infer live supplier or deployment acceptance from the operation's presence in source.

## Summary Filing And Meaning

`parseCrawlSummary` extracts the crawl's stored figures and recognized checks. `CRAWL_ISSUES` maps known checks to severity and wording. Unrecognized supplier fields are not automatically new issue rows. Extending the recognized dictionary would be a source change requiring its own implementation review, not a documentation fix.

`writeCrawl` removes a bounded set of prior rows for the same pull, inserts the parsed summary and clears the pull's parsing error. It also calls the website-page change notification path and updates crawled-page and on-page-score daily evidence for watching places. The same-pull cleanup is bounded at five rows; describe it as replay handling, not an unlimited repair of arbitrarily duplicated historic records.

`siteAudit` reads the newest `siteCrawls` entry through the site/day index. It projects pages crawled, nullable maximum pages, score and available technology/link figures. Pages found combines crawled and queued pages where supplied. Missing values remain nullable instead of masquerading as measured zero. The report's current table and historical chart can consequently have different observation scopes.

The turned-away classifier only applies when the crawl reached three pages or fewer. It recognizes robots restrictions, unreachable sites, invalid page status, no-index metadata or headers and too many redirects, otherwise returning a general blocked classification. More than three crawled pages returns no turned-away classification. This is deliberately a small-crawl heuristic, not a proven diagnosis of the site's complete access policy.

## Stored Detail Shape

`siteSchema.ts` declares `siteCrawlPages` and `siteCrawlLinks`. Both store `websiteId`, `pullId` and a day. Page rows contain URL and normalized page identity, status, optional resource type, recognized problem keys, score, load and largest-paint measures, size, word count, internal/external/inbound link counts, depth and optional redirect/canonical fields.

The parser does not retain the crawled page body or all its words. Avoid treating word count as text storage or promising an HTML archive. Broken-link rows retain source and destination addresses plus available type, direction, status and dofollow values. They support investigation of observed links without creating a website write capability.

Page indexes include `by_pull`, `by_site`, `by_site_page` and `by_pull_inbound`. Link rows use `by_pull` and `by_site`. These serve newest-pull reads, page-level evidence and bounded cleanup. The summary is stored separately in `siteCrawls`; a summary count is not computed by counting the limited page examples a customer happens to read.

## Detail Fetch, Writes And Retry

`crawlOf` accepts a stored pull only when it has a task ID and website and uses the `site_crawl` operation. `fetchCrawlDetail` then requests the pages endpoint and the links endpoint, with a broken-link filter on the latter. `DETAIL_PAGE` is one thousand and `MAX_DETAIL_REQUESTS` is ten independently for each list. A short page finishes the respective list; ten full pages mark it cut.

A missing task result or provider task status at or above the failure threshold rejects the fetch. Both complete bounded lists are fetched before stored detail is changed. This protects the previous detail from a supplier refusal during that stage. It does not make the subsequent multi-mutation write sequence transactional or promise recovery from every possible local failure after replacement starts.

Rows for the same pull are cleared before insertion, then `writeCrawlPages` and `writeCrawlLinks` save chunks of 250. Older-detail cleanup runs in separate bounded mutations. `recordDetailCut` persists the collection bound and the holding-page rebuild path is requested after filing. Reads during these steps can see a newer summary and incomplete or older detail; consumers should not infer atomic freshness across all those tables.

Failure recovery schedules another attempt fifteen minutes later, with three attempts in total. Exhaustion records the parsing failure through `seoCollectionParse`. There is no reason for a report reader to create an independent retry loop. Investigate the pull, saved task status and existing scheduled work before any separately authorized operational action.

## Query Bounds And Cleanup Limits

`crawlProblemPages` checks the company holding, chooses the latest crawl and reads up to 1,001 page rows, retaining one thousand before filtering by the requested problem key. The extra row detects truncation. Therefore the returned examples can omit a matching page beyond that candidate window even when detailed collection retained more pages.

For the broken-link issue it separately reads 1,001 link rows and retains one thousand, associating destinations with their observed source URL. The result's cut flag includes page and link limits and the saved `detailCut` indication. A frontend table pager cannot expand these backend candidate windows. Summary totals and detail examples must not be described as guaranteed to match.

`clearOlderCrawlDetail` reads a first batch of five hundred site rows and removes rows belonging to older pulls. Its continuation conditions can leave older rows beyond a batch occupied by current rows. The latest-only retention declaration is the intended detail lifecycle, but this cleanup implementation is not evidence of exhaustive deletion for every arbitrarily large prior dataset. Report cleanup questions separately rather than silently claiming a stronger guarantee.

`keepRules.ts` declares crawl summaries `FOREVER` and page/link details `LATEST`. Historical summary charts are therefore distinct from a historical detail archive. The deletion timing and bounds follow the actual filing/cleanup code, not a promise that every old page row disappears at a particular wall-clock deadline.

## Cost Correction And Evidence

`seoCrawlRefund.ts` calculates a stored cost correction for a ready crawl when known returned rows are below the positive requested maximum and the recorded cost is positive. It updates the relevant stored cost and rollup paths and uses the saved refunded amount to avoid repeating the same correction. This is recorded collection accounting, not proof of a Stripe cash refund or money returned by a live supplier.

`siteCrawlDetail.test.ts` covers address/check parsing without storing page words, tenant-bound problem reads and broken-link examples, refusal preserving previous detail with scheduled retry, and repeated successful filing without doubled rows. Those declarations were read as implementation evidence. They were not executed during this documentation-only pass and do not establish live crawl acceptance.

See [Collection Operations](./collection-operations.md) for orchestration and [Technical Site Audit](../end-user/technical-site-audit.md) for the customer workflow. PRODUCT.md section 33 remains the rename-cutover record. Do not repair a failing external integration by restoring old framework identifiers, and do not call local parser or query coverage proof of deployment or customer outcome verification.
