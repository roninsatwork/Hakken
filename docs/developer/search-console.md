---
product: Hakken
documentation_type: developer guide
feature_area: Search Console
audience: developers and platform operators
source_repository: roninsatwork/Hakken
source_path: docs/developer/search-console.md
last_reviewed: '2026-10-26T08:52:19+00:00'
reviewed_against: current implementation
status: Current
---
# Search Console

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Search Console
> **Reviewed:** 26 October 2026, 08:52:19 GMT (Europe/London)
> **Source path:** `docs/developer/search-console.md` · **Status:** Current

## Boundaries and route composition

Search Console is implemented through the route family
`src/app/(dashboard)/app/search-console/`, tenant-owned connection/report tables
and the shared Google grant service. This guide covers connection, collection,
read models, storage shape and cleanup. It does not mark planned Insights
outcomes or the complete asset profit-and-loss model delivered. No live Google
request or test suite was run for this review.

The section's `_components/useSearchConsole.ts` defines `SEARCH_CONSOLE_PAGES`,
menu groups, result kinds and URL propagation. Groups cover tracked lists,
figures, changes, opportunities, breakdowns and settings. The result menu omits
image search. Shared page/list/chart components use source queries and actions;
a directory name alone does not prove that a feature has fresh data or that a
particular deployment has connected its property.

Keep UI menu labels separate from stored route segments. Keywords, Pages,
tracked records, indexing, service demand, country/device breakdowns,
position bands, volatility, click-rate and connection routes all sit under a
company hold. A new route must reuse the same hold and source-filter model
rather than accept a global `websites` ID as permission to read private Google
figures. The [user guide](../end-user/search-console.md) explains those
selections without exposing the module split.

## Authorization and connection

`searchConsoleConnect.beginSearchConsoleConnect` uses `adminMutation`, calls
`requireMySite` and rejects a tracked competitor hold. Other connection
mutations also resolve the caller's company hold. Read functions use tenant
builders plus `siteAccess` checks. `siteAccess.findMySite` compares the
hold's company to the resolved company; possession of a host or a global
website record is insufficient.

`googleConnection.ts` owns the shared OAuth grant, random section-prefixed
state and fifteen-minute pending-state age. Search Console uses
`SEARCH_CONSOLE_GOOGLE_CLIENT_ID`, `SEARCH_CONSOLE_GOOGLE_CLIENT_SECRET` and
`CONNECTOR_TOKEN_ENCRYPTION_KEY`, with `CONVEX_SITE_URL` supplying the server
origin. OAuth endpoints remain `/api/search-console/oauth/authorize` and
`/api/search-console/oauth/callback`. Credentials stay server-side; tokens are
stored encrypted through the common Google connection/token tables.

`searchConsoleApi.ts` requests `webmasters.readonly` and account identity
scopes. `propertyFit` distinguishes an exact domain, a root prefix, a partial
prefix and a parent domain covering a subdomain. `listProperties` returns
permissions; unverified access is not equivalent to a readable property.
`chooseSearchConsoleProperty` accepts only an offered property while the
connection is CHOOSING. `connectTo` records the connected property, audits the
change and starts first collection. If it is another property, it clears
incompatible saved figures first.

The connection schema distinguishes CONNECTING, CHOOSING, CONNECTED,
NEEDS_RECONNECT and DISCONNECTED. Problems include revoked access, missing
property permission, unreadable token material, missing deployment setup,
Google busy and a relationship no longer owned. `noteProblem` separates
conditions needing reconnect from temporary/deployment problems. Do not
convert every failure into a reconnect request or an unlimited retry loop.

## Collector and first history fill

`searchConsoleAgentRun.runSearchConsoleCollectorNow` is the role-run entry
point for regular collection. Each website has its own persisted run and
scheduled steps. `searchConsoleFirstCollection.startFirstCollection` starts
recent collection after connection. The ordinary collector and first
collection use `searchConsoleSync.ts` rather than independent implementations
of the source queries.

`searchConsoleSync` sets a four-minute step budget and seven-day step size.
Its initial window is ninety days, with recent days fetched again while
Google's figures settle. `REFETCH_DAYS` is four. Importantly, first fetch size
is not the same as ongoing retention: `utils/searchConsolePacks.DAYS_KEPT` is
sixty. Some older module comments still describe weekly/monthly rollups of
all detailed lines; the current `searchConsoleRollups` implementation instead
clears lines past the retained day window.

`searchConsoleHistoryFill.ts` follows recent collection with older totals and
selected chart history toward the sixteen-month limit. It does not download
every older daily search/page line. Asks are paced a second apart. A busy
response schedules a ten-minute wait, at most three such waits before leaving
remaining work to a subsequent run. A time-limited step hands on its progress;
a scope is not marked complete until its required asks finish.

`collectionSteps` and the role-run infrastructure record activity, progress
and continuation. Source writes carry the connection and property they were
requested for and are dropped if those changed. This protects a disconnected
or newly repointed hold from a late worker mixing old-property data into its
new figures. Preserve that check when moving work between actions and
mutations.

`searchConsoleDays.newestWholeDay` approximates Pacific day boundaries using
UTC minus eight hours year-round; in summer it can delay a first fetch by an
hour. `historyLimitDay` applies the sixteen-month source window. Do not
silently replace that policy in documentation with the Analytics property's
time-zone rule: the two sources currently implement different day logic.

## Provider API, limits and source semantics

`searchConsoleApi.queryAnalytics` is the provider boundary. It uses pages of
25,000 rows and a bounded maximum of 50,000 rows per day/result kind. It
supports source dimensions, filters and report selection without database
ownership policy; caller modules establish that policy. A provider cap is
not evidence that the entire underlying population has been observed.

`searchConsoleKeep.keepsSearch` retains a detailed search when it has clicks,
its position is at most twenty, or multiple pages appeared. Tracked searches
also qualify through the surrounding keep logic. The collector derives a
search's figures from its search/page pairs, while requesting pages and
website totals separately so rare queries withheld by Google do not erase
those totals. Never rebuild an exact website total by summing only retained
or visible search rows.

`searchConsoleCountries.ts` distinguishes configured ready countries from
live country reads and stores which spans each has. `searchConsoleReads`
validates date ranges, resolves authorized target connections and uses
`countryScope`. A saved `searchConsolePerformance` result can indicate that
live retrieval is needed rather than inventing an empty historical result.
`searchConsoleLiveDays` is a tenant action that resolves the effective company
and revalidates its hold before asking Google.

Google quotas and transient failures must remain distinct from unavailable
history. `askLive`, token renewal and API failure classification are shared
rather than duplicated in each screen. Documentation review authorizes no
quota probes, fills or real calls. For any future operational exercise, follow
the repository requirement to inspect the relevant allowance and retain
headroom before starting work.

## Stored tables and prepared period reads

`searchConsoleSchema.ts` is composed into `schema.ts`. Connections use
`by_hold`, `by_pending_state` and `by_status`. `searchConsoleDays` indexes by
hold/country/type/day. `searchConsoleLists` indexes detailed packed parts by
hold/country/type/list/grain/start/part. Those are private company-hold records,
unlike shared supplier observations keyed globally by website.

Prepared periods use `searchConsolePeriods`, `searchConsolePeriodBooks` and
`searchConsolePeriodUses`. Book indexes include a build timestamp so readers
can resolve the correct version's numbered records; period slots and parts
must remain in agreement. `searchConsoleKeywordBooks` stores monthly keyword
references. `searchConsoleSeen` and `searchConsoleSeenDays` support first/last
appearance history, while `searchConsoleTracked` and `searchConsoleRuns`
cover tracking and run records. Do not treat a table's presence as proof every
old record has already migrated to its newest format.

`searchConsolePeriods.ts` builds period data and `searchConsolePeriodReads.ts`
reads it. `searchConsoleLists.ts` applies list views, filtering, sort and
paging, with separate modules for keyword tables, large lists, classifications
and source naming. Shared `utils/calendarPeriods.ts` owns the seven calendar
choices and incomplete-period comparisons. UK calendar boundaries in that
helper do not change the provider's own daily reporting basis.

Reports for a whole prepared period, daily totals, charts and an individual
page/search are different read shapes. Some details and non-ready countries
are requested live rather than reconstructed from coarser storage. Use the
existing exported read appropriate to the question. Reusing the same read
in an Assistant tool avoids a second interpretation of the source and keeps
lookup links meaningful.

## Disconnect, purge and useful verification

`disconnectSearchConsole` stops collection, removes pending sign-in material,
records a disconnect audit event and schedules `googleConnection.releaseUnused`.
It retains collected figures. The release path considers remaining Analytics
or other Google-grant use before revocation. This operation must not be
advertised as deletion of all Google data or revocation of an account's entire
access across every website.

`searchConsoleSync.clearFigures` removes incompatible figures in scheduled
batches and can initiate first collection after a property change.
`searchConsoleSync.purgeHold` instead removes a no-longer-held site's private
Search Console records as part of the hold cleanup chain reached through
`googleConnection`. Keep their continuation and connection-state checks;
a partial batch must not be mistaken for a finished purge.

Relevant tests include `searchConsole.test.ts`, `searchConsoleApi.test.ts`,
`searchConsoleReads.test.ts`, `searchConsolePeriods.test.ts`,
`searchConsoleCountriesKept.test.ts`, `searchConsoleSettling.test.ts`,
`searchConsoleTidy.test.ts`, `searchConsolePeriodBooks.test.ts` and the
large-list/scale suites. They cover different concerns; this pass inspected
selected implementations and declarations without executing the tests.
Future code changes still require the complete repository gates and mocked
provider coverage. No saved or local fixture result establishes that Google
consent, deployed callbacks or a live sixteen-month fill has succeeded.
