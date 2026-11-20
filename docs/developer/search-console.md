---
product: Hakken
documentation_type: developer guide
feature_area: Search Console
audience: developers and platform operators
source_repository: roninsatwork/Hakken
source_path: docs/developer/search-console.md
last_reviewed: '2026-11-05T08:44:16+00:00'
reviewed_against: current implementation
status: Current
---
# Search Console

> **Product:** Hakken · **Document type:** Developer guide · **Feature area:** Search Console
> **Reviewed:** 5 November 2026, 08:44:16 GMT (Europe/London)
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

**Every search's lines are kept** (Anthony, 18 November 2026: "keep every
search in the kept lists"). From 5 October to 18 November 2026 a keep rule
(`keepsSearch`, finish-off plan round two, D) dropped a search with no click,
a position past twenty and one page: about one line in nine, judged day by
day, so a month's kept keywords never matched Google's live answer for the
same days. It is gone from the nightly collection (`searchConsoleSync.ts`),
the long periods (`searchConsoleLongLists.ts`) and the tidy. The days kept
were asked again for their searches (`searchConsolePageRefetch:refetchPairs`).
The one limit left is a memory guard, `MOST_PAIRS_HELD` (400,000 searches by
page in one long period): past it the searches shown least go first, never
one clicked or tracked, a search let go stays out unless it comes back with
a click, and the run's log and every Search Console screen say how many
(`searchesLetGo` on the connection). No website on dev has reached it. The collector derives a
search's figures from its search/page pairs, while requesting pages and
website totals separately so rare queries withheld by Google do not erase
those totals. Never rebuild an exact website total by summing only retained
or visible search rows.

**A page's figures are every country's** (Anthony, 2026-11-17: "Every
country's pages"). Every other ask carries the home country's filter, but
Google leaves the searches it keeps private out of a page's figures whenever
a country is named, filtered or split by. Tested on morehandles.co.uk's
15 October 2026: its UK pages added up to 68 of 266 clicks, split by country
to 80 of 315, and asked of no country to 317 of 315. So the page list, one
page's days and one page's devices are asked of no country
(`EVERY_COUNTRY_LISTS` in `searchConsoleApi.ts`, `askLive`'s
`everyCountry`), in the nightly collection, the long periods and live asks
alike; a country kept ready holds the same every-country pages. A page's
searches stay the home country's, so a website's pages add up to more than
its home-country clicks. Each page screen said so until every screen came to follow the
country menu (2026-11-18); the notice (`SearchConsoleEveryCountry`) went on 2026-11-20 with
the last two screens that showed it. The kept page lists were fetched again once,
and every period built again with its long periods asked afresh
(`searchConsolePageRefetch.ts`, `fresh` on `rebuildSitePeriods`).

Only a page asked alone, or by day, is whole. Split by device or by country,
even with no country named, Google still leaves the private searches out:
on morehandles.co.uk's home page in October 2026 the page and its days held
396 clicks, its devices and its countries 255 each (checked after the fetch
again, 2026-11-17). So "Where the clicks came from" on a page's own screen
shares out the part Google splits, not all of the page's clicks.

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

## November date and eye integration — scoped review

`utils/calendarPeriods.ts` now defines the seven menu literals, `periodSpan`, `spanBefore`, `customSpans` and default chart steps. Sites and Search Console share `SiteDateRange.tsx` and `siteRange.ts`; URL custom choices carry `period=custom`, `from`, `to`. `periodOrOpening` is an explicit fallback for screens unable to answer a custom range. Do not pass retired quarter literals into current validators.

`searchConsoleLists.readListPage` resolves `periodOf` with the requested period and source newest day. A non-prepared span returns the live-read shape; detail keyword/page relationships can also require Google even for a named period. Other source-country readiness rules still apply. This differs from Analytics' custom-key list generation, Bing's weekly reconstruction and Clarity's scheduled local aggregation; share date arithmetic without merging their storage semantics. The changed `calendarPeriods.test.ts`, `searchConsolePeriods.test.ts` and list tests are verification sources, not run results here.

The page's eye receives its own query answers through the section wrapper and shared child-part registration. Follow the [eye guide](./what-hakken-sees-guide.md) for provenance, credits and run checks. This is a scoped date/eye refresh; recent search-change, volatility, demand and large-list optimizations remain separate queue items in the central inventory.

## Performance's charts — 17 November 2026

Performance is the page Anthony chose on the canvas ("The new page so far · Way 3 with the dots from Way 4";
`docs/plans/active/search-console-performance-way-3-plan-2026-11-17.md`). It is built from shared parts only, in
`search-console/_components/PerformanceParts.tsx`: `DaysChart` for the day chart, `HundredGrid` and `HundredStrips` in a
`MapCard` for the squares and bands, `DotGroups` in a `MapCard` for the keywords.

Its reads are the ones other screens make, plus one:

- `searchConsolePerformance` and `searchConsoleLiveDays` return `daysBefore`, the span before's days, which the chart
  lays under the dates. `DaysChart` weighs average position by impressions (`perScale: 1`), as Google does.
- The page list's summary gives each Classification `impressions` and `previousClicks` (`KindCount` in
  `utils/searchConsoleViews.ts`, counted the same way by the keyword table's `Tally`).
- `searchConsoleTopKeywords` (its own module, as `searchConsoleLists.ts` is at the size ceiling) names the 300 keywords
  Google showed most (`TOP_KEYWORDS`), with the keyword list's brand split. Other dates ask Google for the whole list.
- Devices and rich results come from `useSearchConsoleSplit`, moved out of Countries and devices.

The eye gets the charts' figures through `performanceSees.ts` (pure, so `searchConsolePeriods.test.ts` builds the same
figures from `moreHandlesSearchConsolePerformanceSplits.json`). Its rules are `splitFindings` in
`utils/sees/own/searchConsole.ts`. The writer's brief went from 3,000 to 6,300 characters
(`codeFirstBriefCeilings.json`), because the page now hands over four charts' figures.

## The lean lists — 17 November 2026

Anthony made the table rule on the Keywords table (AGENTS.md "Tables are lean";
`docs/plans/active/search-console-keywords-lean-table-2026-11-17.md`), and every list built on `SearchConsoleListScreen`
follows it, with New and lost:

- **The name and at most five more columns.** `keywordColumn` and the new `pageColumn` hold the name at
  `min-w-[160px]` beside its `CUT_COLUMN` share and cut it to one line, whole on hover. `PageNameCell` shows a page's
  title once Google Analytics knows it, else its address, on one line, with both on hover (`RecordLinkCell`'s `hover`).
- **One line a row.** `clicksAndChange` and `positionAndMove` are gone: a move is its own column, `change`, headed
  "Up or down" (`table.change`, shared with Position bands and Google updates).
- **Wins and losses was dropped** (Anthony, 2026-11-19: "Yes, drop it"). Keywords sorted by Up or down lists the same
  keywords and the same change. The eye's links to it, and old links (forwarded in `next.config.ts`), open Keywords at
  `?sort=change`, or `?sort=change&dir=asc` for losses. Its `moves` list rule and Wins or losses filter went with it.
- **Short headings.** `figureColumns`' impressions are headed "Shown" with "Impressions" on hover (`ShownHeading`,
  `table.shown`, `table.shownTitle`). CSV downloads keep Google's own words and every field.
- **Low click rate, Way 2** (Shown but not clicked until it was renamed the same day, its address kept; Anthony,
  2026-11-20: "ok i think we build way 2 and also wire it up to what hakken sees", then "ok call it low click rate"; `docs/plans/active/search-console-shown-but-not-clicked-way-2-plan-2026-11-20.md`). The country's own pages
  (`inCountry`), four boxes, `MirrorBars` of each position 1 to 20 (`Summary.lowCtr`, `lowCtrOf`, on both read paths), and
  a lean table of Page, Shown, Position, Clicks and Usually, the most clicks short first (`gap`). No Device menu. Its eye
  has its own rules (`own/searchConsoleLowCtr.ts`) and Ask Hakken reads it (`screen: "lowCtr"`).
- **Pages competing is now Keyword cannibalisation** (Anthony, 2026-11-20: "i want it to be called keyword
  cannibalisation"), Insights' name for the same thing. The menu, the title, the eye's screen entry and the approved
  look's title, in English and Italian ("Cannibalizzazione delle parole chiave"). The address stays `/pages-competing`.
  Built the same day as Way 3 on Insights' rule (`convex/utils/cannibalisationRule.ts`, shared with Insights): the home
  page and brand searches left out, a keyword listed when two or more pages each took 1 in 10 of its impressions; four
  boxes; the ticked keyword's pages each day asked of Google (`searchConsoleKeywordPagesByDay`) with a Pages menu; and a
  Swaps column counted in the nightly build for periods kept day by day (`PairStream.swapSpans`, kept as the competing
  list's `counts`). `docs/plans/active/search-console-keyword-cannibalisation-way-3-plan-2026-11-20.md`.
- **Missed demand was taken out of the menu** (Anthony, 2026-11-20: "Yes, take it out"). Its second list was Keywords
  with Tracked on Not tracked; its first was Visibility's monthly searches, not Google's, many for searches Google never
  showed, and their sum counted the same people several times (49,500 a month for five spellings of one search). Old
  links open Keywords (`next.config.ts`); Brand and non-brand's eye step opens Keyword research. Its `missed` list rule,
  the List menu (`filters.missed`), its eye entry and words, and `searchConsole.almost` (whose words it borrowed) went
  with it. Its three limits on the admin Limits screen (`consoleMissedKeywords`, `consoleSearchedALot`,
  `consoleBarelyShown`) are left for now: they're saved settings, read by nothing since.
- **By page classification was taken out of the menu** (Anthony, 2026-11-20: "i think its a duplicat amnd we dotn need
  it", then "Yes, take it out"). Classifications shows each classification's times shown, clicks and pages, and Brand
  and non-brand the brand searches. Its chart of keywords by what the searcher wants went with it; Keywords' "What the
  searcher wants" menu still filters to each. Old links open Classifications (`next.config.ts`). Its page, look, eye rule
  (`typesSees`) and words went; `KindBars` and `usePageKinds` stay, shared with Sites and Google Analytics.
- **Real against estimated was taken out the same day** ("lets take out thi spage too please"). Old links open Pages.
  Its page, look, eye rule (`estimatesSees`) and words went, and then, on "Yes, remove it", everything behind it: the
  `estimates` list rule and its row figures (`estimate`, `verdict`) and summary counts (`estimate`, `high`, `low`), the
  Estimate menu (`verdict` chip), the Estimate sort and download column, the admin limit `consoleEstimateOff` (no value
  was saved on dev), and Visibility's estimate for each page, which the nightly build looked up and kept on the period
  lists: it now asks a page's type alone (`PAGE_TYPE_ONLY` in `convex/searchConsolePeriods.ts`). The `estimates` field
  on `searchConsolePeriods` stays in the schema, no longer written or read, until no row built before holds it.
- **Almost there was taken out of the menu** (Anthony, 2026-11-20: "lets remove almost there from the menu"). Position
  bands lists the same keywords at 4–10 and 11–20. Old links (forwarded in `next.config.ts`) and the eye's links from
  Keywords, Click rate by position and Google Analytics' Overview open Position bands; Position bands' own eye says no
  step there, as it would link to itself. Its `almost` list rule and 4–20 Position menu went with it. A "Close to
  the top three" choice on Pages was drawn and approved the same morning, then dropped before it was finished (Anthony:
  "i liked the current bands"): the Position menus keep their bands as they are.
- **What moved to the row's own screen:** Track on Keywords, Pages, Almost there and Missed demand (the record screen has
  its own Track box); Pages and Top page on Keywords and the tracked keywords; Keywords and Top keyword on Pages and the
  tracked pages; CTR on the two tracked lists, which keep Track because unticking is what they are for; Position on
  Shown but not clicked, which had six figures; the count of pages on Pages competing. Brand and non-brand keeps CTR
  and leaves out Up or down.

Still over the rule, frozen in `scripts/table-columns-allowlist.json` and waiting on Anthony: the table on a keyword's or
a page's own screen (Track and six more) and the list of connected websites.

## A keyword's own screen — 17 November 2026

Way 2 on the canvas (`docs/plans/active/search-console-keyword-screen-way-2-plan-2026-11-17.md`).
`SearchConsoleRecordScreen` branches on the dimension: a keyword gets Performance's day chart (`PerformanceDaysCard`,
fed by `searchConsoleKeySeries`' new `daysBefore`), the bands of which page Google shows and which gets clicked
(`KeywordPagesBands`, figures from `keywordSees.ts` over `useSearchConsoleList`'s new `allLiveRows`), and the lean table.
It doesn't ask `searchConsoleKeySplits`. A page keeps the old layout, with its countries and devices, until its own
board is agreed. The eye's `recordFindings` reads `bands` on a keyword's screen and `cameFrom` on a page's only.
