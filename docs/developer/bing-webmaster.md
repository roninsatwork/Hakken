---
product: Hakken
documentation_type: developer guide
feature_area: Bing Webmaster
audience: developers and platform operators
source_repository: roninsatwork/Hakken
source_path: docs/developer/bing-webmaster.md
last_reviewed: '2026-10-26T08:55:34+00:00'
reviewed_against: current implementation
status: Current
---
# Bing Webmaster

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Bing Webmaster
> **Reviewed:** 26 October 2026, 08:55:34 GMT (Europe/London)
> **Source path:** `docs/developer/bing-webmaster.md` · **Status:** Current

## Entry points and reviewed scope

Bing Webmaster is implemented by
`src/app/(dashboard)/app/bing-webmaster/`, `convex/bingWebmasterConnect.ts`,
`bingWebmasterApi.ts`, `bingWebmasterAgentRun.ts`, `bingWebmasterCollect.ts`,
`bingWebmasterReads.ts` and `bingWebmasterSchema.ts`. Shared pure weekly-list
logic lives in `convex/utils/bingWebmasterWeeks.ts`. This review establishes
local implementation behavior, not a working deployed Microsoft application
or a completed live collection.

`_components/useBing.ts` defines `BING_PAGES`, filter propagation, page matching
and period/step helpers. The route family exposes Performance, Keywords,
Pages, Crawling, Against Google and Connection, with keyword/page detail
routes. `BingGate` handles prerequisites and `hasFigures` requires a newest
saved day, no CHOOSING state and no active clearing operation. A connected
record alone is not sufficient for a screen to claim available history.

The [end-user guide](../end-user/bing-webmaster.md) covers the workflow and
comparison caveats. Product intent remains in [PRODUCT.md](../../PRODUCT.md),
whose older Bing-unbuilt statement is recorded as a discrepancy in the
[coverage inventory](../index.md#documentation-coverage-inventory). Do not use
these source files as evidence that a broader planned product milestone or
live acceptance gate has been completed.

## OAuth, roles and private ownership

`beginBingConnect`, site choice and `disconnectBing` use `adminMutation` and
resolve the company hold through `requireMySite`. Initial connection rejects
tracked competitor relationships. Status and report queries use tenant-aware
builders and hold checks. A host shared in the global website registry is
not authority to access a different company's private Bing tokens or reports.

The provider configuration in `connectorOAuthProviders.ts` uses
`BING_WEBMASTER_CLIENT_ID` and `BING_WEBMASTER_CLIENT_SECRET`.
`CONNECTOR_TOKEN_ENCRYPTION_KEY` protects saved tokens, and
`isBingConfigured` requires both provider credentials and encryption setup.
`CONVEX_SITE_URL` supplies the server authorize origin; `SITE_URL` supplies
the application return destination. Values remain in backend configuration,
never a guide, returned status object or browser query parameter.

`BING_AUTHORIZE_PATH` is `/api/bing-webmaster/oauth/authorize` and
`BING_CALLBACK_PATH` is `/api/bing-webmaster/oauth/callback`. The implementation
keeps a random pending state on the connection, accepts it within fifteen
minutes and spends it once. Code exchange, token encryption and verified-site
selection occur server-side. One whole-site verified match is connected
automatically; several candidates wait for an explicit choice. Reconnection
can retain the previous site where still applicable instead of silently
selecting another one.

`BING_SCOPE` is `webmaster.read`. There is no implemented provider revocation
endpoint in this connector. Disconnect deletes local token material;
provider-side grant withdrawal remains a manual Bing action. A future change
to managed submissions or recrawl requests would be a permission/product
change, not a routine documentation correction.

## API and source representation

`bingWebmasterApi.callBing` sends GET requests to the provider's JSON service,
with site parameters in the request and an access token in the Bearer header.
It unwraps the WCF result under `d`. `dayOfBingDate` interprets WCF date values
using the supplied offset when present. Do not substitute a browser's local
date conversion for the source-day interpretation.

Failure classification separates expired tokens, denied access, busy/quota
responses, refused questions and unreachable transport. The collector can
refresh an expired access token and uses short bounded waits for busy or
unreachable calls. Authorization failures that require reconnect must remain
visible. They are not an invitation to loop provider calls until they pass.

The API helpers return website traffic days, crawl days, weekly query/page
statistics and individual page information. Website-day totals and weekly
keyword/page rows are distinct shapes. Whole-week list aggregation cannot be
described as an exact daily list for an arbitrary partial week. This matters
when adding another date filter or comparing a detail's totals with a chart.

## Scheduled collection and progress

`bingWebmasterAgentRun.ts` implements the Bing Webmaster Collector role and
per-website work. The role's schedule starts regular collection, while a new
connection can start its own website run. Website starts are staggered by
five seconds. Steps use a four-minute budget, keeping a large company from
requiring all of its sites to finish inside one provider action.

`collectTarget` re-reads the connection status, chosen site, clearing state,
ownership and available dates for a step. The run retrieves days and crawl
figures, then query/page statistics. It fingerprints weekly rows and avoids
rewriting unchanged weeks. Prepared lists rebuild when new/changed weekly
data warrants it or the period refresh is due. Important-page checks have a
roughly weekly cadence, independently of daily website observations.

`BUSY_WAITS_MS` currently contains two and eight seconds. These are transport
retry waits, not permission to bypass a source quota or issue repeated manual
runs. Failed access, a missing connection or a site no longer owned must stop
the relevant work with its recorded reason. Role-run progress and scheduled
continuation carry large runs across action boundaries. No collector, manual
Run action, connection check or provider request was executed for this guide.

`bingWebmasterCollect.writeDays` updates indexed day rows when their recorded
values change. It preserves independently supplied traffic/crawl fields.
Weekly writes use numbered records and packed numeric parts. Page addresses
share the hold's page-numbering layer through `holdPageRefs`; keywords use
`bingWebmasterBook`. Preserve the correct book/version relationship when
reading a numeric key rather than treating it as display text.

## Tables, retention and period construction

`bingWebmasterSchema.ts` contributes `bingConnections`, `bingTokens`,
`bingDays`, `bingWeeks`, `bingKeywordBooks`, `bingPeriods`, `bingPageChecks` and
`bingLive` through the root schema. Connections use `by_hold`,
`by_pending_state` and `by_status`. Token indexes include `by_connection` and
`by_hold`; secret ciphertext is not part of the client status projection.

Day reads use `by_hold_day`. Weekly parts are indexed both by
hold/list/week/part and hold/list/part/week. Keyword books use hold/chunk,
prepared periods hold/list/period/comparison/part, page checks hold/page and
live answers hold/ask. These indexes encode private hold ownership and the
query shapes. Avoid scanning unrelated companies' rows to filter in memory.

`utils/bingWebmasterWeeks.ts` packs parts of up to 2,000 rows. It stores
position multiplied by impressions so aggregation can calculate a weighted
position, rather than averaging unweighted row averages. `oldestWeekKept`
sets thirteen months of weekly history. The source can provide a shorter
window on first connection; retained reach is not guaranteed initial depth.
Do not extend that thirteen-month statement to every table without checking
its cleanup path.

`weeksOf` chooses available whole weeks for calendar periods and their
comparison spans. Calendar choices come from `utils/calendarPeriods.ts`,
including incomplete-period handling. Prepared periods keep actual source
bounds. Preserving those bounds in UI and exported context is essential when
daily totals and weekly lists are displayed beside one another.

## Reads, live details and Google comparisons

`bingWebmasterReads.ts` exposes tenant queries including `bingPerformance`,
`bingListPage`, `bingListAll`, `bingRecord` and `bingCrawling`.
`bingListPage` resolves the hold, applies source filtering/sort and pages the
result. Page-kind filtering uses the shared classification helpers; page
titles are resolved through the shared hold title/reference layer.

`askBingLive` is a tenant action for a keyword's pages or a page's keywords.
It resolves the effective company and validates the target hold internally,
asks Bing and writes a named cached result through `keepLive`.
`bingLiveRows` reads that result by hold and ask. Thus ordinary screens can
read retained data while an individual detail still performs a provider call.
A failed extra ask must not be reported as loss of the saved whole-site data.

The comparison's Google source is the website's main home-country web result
from Search Console; Bing covers every country. `googleDaysBetween` reads
saved Search Console days, and `shareOf` returns null when Google's input is
unavailable or the combined denominator is zero. Preserve null as unavailable
rather than presenting it as an observed zero. A Bing-versus-Google ratio
from these unequal country scopes is not universal search-engine market
share. The Assistant should reuse `readPerformance` or another existing read
and preserve that limitation.

## Disconnect, cleanup and tests

`disconnectBing` deletes stored tokens, marks DISCONNECTED, clears pending
state/choices/problems and records `BING_WEBMASTER_DISCONNECTED`. Saved
figures remain. `clearFigures` deletes incompatible report data in batches
when switching context, and `purgeHold` removes reports, tokens and connection
rows for a no-longer-held website. The latter reschedules while more parts
remain. A single batch returning is not necessarily completion of cleanup.

Relevant tests are `bingWebmasterConnect.test.ts` for role/ownership, one-use
state, matching and disconnect behavior; `bingWebmasterApi.test.ts` for source
parsing; `bingWebmasterCollect.test.ts` for stored collection;
`bingWebmasterReads.test.ts` for figures and privacy; and
`bingWebmasterScale.test.ts` plus `utils/bingWebmasterWeeks.test.ts` for scale
and packed-period logic. The route family also has look tests. This pass
inspected selected implementations and test declarations, but ran none of
those tests and contacted no live Bing account. Live consent, callback
registration, provider coverage and deployed data freshness need their own
explicitly authorized verification.
