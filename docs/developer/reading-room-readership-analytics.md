---
product: Hakken
documentation_type: Developer guide
feature_area: Reading room readership analytics
audience: developer
source_repository: roninsatwork/Hakken
source_path: docs/developer/reading-room-readership-analytics.md
last_reviewed: '2026-10-26T14:12:50+00:00'
reviewed_against: current implementation
status: Current
---
# Reading Room Readership Analytics

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Reading room readership analytics
> **Reviewed:** 26 October 2026, 14:12:50 GMT (Europe/London)
> **Source path:** `docs/developer/reading-room-readership-analytics.md` · **Status:** Current

Readership analytics is the internal platform view of engagement with Hakken's reading room. The entry route is `/admin/content/analytics`, with Overview, Articles, People, and Companies tabs and article/company detail pages. Its backend is `convex/readingAnalytics.ts`; event recording lives in `convex/reading.ts`, and the three table definitions are in `convex/readingSchema.ts`. This guide covers the counting contract and its bounds, separately from the customer [Reading room](./reading-room.md) and company knowledge management.

All six analytics queries use `superAdminQuery`. Their purpose includes cross-company editorial review, and their projections can contain reader names and company names. They are not tenant-admin reports. Do not expose them through a customer page merely because the customer can record their own reading activity. The visible admin navigation is not the authorization boundary: the query wrapper is the server-side gate.

## What is recorded

`recordReading` is a tenant mutation accepting `VIEW`, `READ`, or `CLICK` and a typed thing identifier. A view is a client opening an article or story. The client hook at `src/app/(dashboard)/app/_learn/useReading.ts` decides that an item has been read after 30 seconds or reaching its end. A click represents opening an original article or a followed person's channel. These are application interaction signals, not browser-independent proof that a person understood an article.

The mutation skips super-admin users and users without a company. Person-type things can receive clicks only; views or reads of a person return without counting. `countedAs` normalizes identifiers and looks up the underlying row. Missing or invalid things return no count. The resolver finds the article, story, or followed person; it does not add a separate published-status check to every resolved knowledge article. Do not advertise this instrumentation as an independent content-visibility enforcement layer.

`recordAnswerInternal` counts articles used by Ask Hakken. It accepts library article IDs and wiki page keys, recognizes the `PRODUCT:knowledge-` key form for platform articles, and deduplicates each supplied list within that invocation. `assistantKnowledge.ts` schedules this work after answer-source selection. Answer use increments article, followed-person where applicable, and overall answer counts. It deliberately stops before marking a user or company as a reader. Reusing an article in an answer is not the same event as a human reading it.

The internal answer mutation verifies that the user exists and is not super-admin, but trusts its internal caller's supplied company association. It does not independently compare the supplied company ID with the user's current company. This is an internal-caller contract to preserve during future work, not a reason to expose the function publicly.

## Identity resolution and item transitions

Own platform articles use `OURS:<id>` item keys; retained web articles use `WEB:<id>`; news stories not retained as knowledge use `STORY:<id>`. A story already linked to a retained library article is resolved to that web article for new events. This avoids continuing to create separate future event streams for the same retained content. It does not migrate or merge all older story totals into the retained article's existing history.

Item activity rows retain title, source name, topic, and knowledge/news placement from the latest interaction. Names in analytics can therefore reflect last recorded reading metadata rather than a live join of every editable content field. Followed-person names can come from their current follow record. Article detail separately resolves original URL and publication/retention dates where the underlying row still exists.

## Tables and synchronous aggregation

Every accepted event inserts a `readingEvents` row with timestamp, UTC day, kind, user, company, and optional item, followed person, or topic. `record` updates the daily and cumulative counters in the same mutation. `readingTotals.by_scope_key_day` holds daily counters plus running counters for `ALL`, `ITEM`, `PERSON`, `COMPANY`, `USER`, `ITEM_COMPANY`, and `USER_TOPIC` scopes.

`addToTotal` updates an existing day row or carries the previous day's cumulative counters into a newly inserted day. Days with no activity have no row. Current call sites use the current timestamp rather than accepting arbitrary historical event times. Inserting historical events independently would require attention to all later cumulative rows; the helper does not rebuild them automatically.

`readingActive` stores the last activity for users, companies, items, people followed, and item/user pairs. `markActive` returns whether that key was first active on that UTC day. The global daily reader and company counts increment on those daily firsts. A period's distinct readers are obtained from last-active records, not by adding daily reader counts, which would count a returning person repeatedly.

No request idempotency token is accepted by the public recording mutation. Client hooks avoid ordinary duplicate signals within their lifecycle, but replaying a valid mutation call records another event. A manual replay or a client retry outside normal handling is not guaranteed to be deduplicated. Per-answer deduplication applies within one internal call, not across repeated calls with the same sources.

## Period queries and bounded populations

Periods are validated as 7, 30, 90, or 365 days, including today in UTC. The previous comparison window has the same length immediately before it. `sumsOver` subtracts the cumulative total before the start from the cumulative total at the end. When there is no qualifying last row in the selected window, it returns zero. `daysOf` reads at most 366 rows for a chart, and the frontend fills inactive days.

`activeSince` retrieves at most 900 recently active entries of one scope. This cap affects active item, user, company, and person populations. Overall event counters can exceed what those bounded populations explain. A list total is exact for the constructed list, not evidence that every historically active record was discovered. `analyticsOverview` returns top five lists with different ranking rules: articles by reads then views, followed people by views then clicks, companies by readers then views, and users by views.

`analyticsArticles` filters the held active-item list by source, knowledge/news placement, and topic, then sorts the whole filtered list using shared sort helpers before pagination. The page helper bounds ordinary page size to 100 and clamps page selection. The `all` flag returns the constructed list for CSV and suppresses per-row trend reads. This is an export of the bounded population, not an uncapped event export.

For an unfiltered chart, the query reads global daily totals. A narrowed chart sums daily item rows in descending view order, with a budget of 6,000 day rows checked between items. The last included item can carry the total slightly past that budget. `daysCut` reports when remaining items were omitted. A narrowed chart can therefore be partial even while the table remains available; chart and table totals must not be presented as universally identical.

## People, companies, and article detail

`analyticsPeople` starts from up to 500 `newsFollows` records before topic filtering, including people with no engagement. Its article count is the follow's accumulated collected count, not the number newly collected during the selected period. Views, reads, clicks, and answer use are period counts. Read rate is reads divided by views, rounded, or null when there are no views; no clamp guarantees a maximum of 100 under unusual repeated signals.

`analyticsArticle` finds its item activity row, reads period totals and up to 900 item/user activity rows, then groups readers by company. Each company's counters come from `ITEM_COMPANY`; its reader count comes from the retained activity window. Missing underlying content can leave historical activity metadata while URL/date fields are unavailable. A completely absent item activity row returns null.

`analyticsCompanies` uses capped active company and user populations and returns daily reader/company activity. `analyticsCompany` requires an existing company, takes up to 500 active users and 500 company users, and ranks each active person's top topic by reads then views. Its people denominator excludes super-admin users within the fetched user window. Reader display names use name, falling back to email. These projections are identifying operator data and should be handled according to the platform's actual access and export procedures.

## Retention, configuration, and evidence

`keepRules.ts` specifies 90-day raw-event cleanup, permanent daily totals, and record-lifetime activity rows. `purges.ts` deletes old raw events in batches of 500 and continues through the generic purge mechanism. Deleting raw events does not erase accumulated totals. Permanent totals and last-active metadata must not be described as a 90-day retention policy for all readership data. A user deletion or privacy request needs the separately documented [retention and purge](./data-retention-and-purges.md) ownership checks.

This subsystem introduces no external analytics credentials or paid request path. Its reports read local persisted interaction data. Relevant tests are `convex/reading.test.ts`, `convex/readingAnalytics.test.ts`, and the admin analytics screen tests. They cover counting, answer-use distinctions, selected filters, company/detail projection, and a super-admin access refusal. This documentation pass read those tests without running application gates. Local fixtures do not establish production activity completeness, historical backfill, deployment acceptance, or resolution of the external rename cutover recorded in [PRODUCT.md](../../PRODUCT.md).
