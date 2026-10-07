# Keeping less history — plan, 2026-10-07

What Hakken keeps of the past, and how to keep only what a screen reads:
keyword positions as graph lines rather than a row per keyword per check,
day tables nobody reads stopped or capped, and Search Console's search and
page lines kept 60 days rather than 90, with the long lists asked of Google;
and what is stored but never read, cut. Beside them, part 6: Ask Hakken
listing only the websites of the company being viewed, under Hakken's own
mark, with questions about Hakken — signed off the same day.

Anthony, 2026-10-07: "do we really need to keep the data for 90 days as
individual days or could we roll up early into a week — say after 60 days";
"the use case really only references historical data for movements and
graphs — there must be a better, more efficient way of storing these going
forward"; "this is about not saving data we don't need to store and don't
access regularly"; "make a documented plan in the repo for this".

**Status, 2026-10-07: phase 1 built and live on dev; the rest to build.**
Started the same day, once the Hakken tasks work had finished (Anthony: "the
other agent has finished … we can start this plan now"; see "Beside the
Hakken tasks work"), on the `keep-less-history` branch merged into `dev`, not
pushed. Part 5 agreed by Anthony the same day ("I agree with all of these"),
and part 6's drawing signed off ("add this to the plan as it's signed off").
Nine decisions are Anthony's (marked **Decision** below, each with a
recommendation). Each part starts with a measurement where one is needed, and
goes ahead only if it bears the part out. About **20 to 25 days** of work in
all. Part 1 is the one that grows without end; part 3 is the biggest for
websites with many pages; part 5's first steps are the quickest wins; part 6
is the one people see.

**Phase 1 — built 2026-10-07** (5.5, 5.6, 5.8; commits `00710159`,
`01227025`): the nine lookup lists and the two search lists no query used
removed; the columns written and never read stopped, cleared from the rows
held by `2026-10-07-clear-unread-columns` (59,552 rows on dev, 301 batches),
then taken out of the schema; the pages copy's top search and the old
Search Console copy kind gone. Measured on dev before and after, rows only
(the lookup lists saved more, not counted by `measureSeoStorage`): the latest
rankings 32.7 → 27.7 MB, each page's rankings 5.4 → 4.4 MB, a keyword's
search features 1.6 → 1.2 MB, Your pages 3.6 → 3.3 MB, the sitemap's pages
1.5 → 1.4 MB; the pages copies shrink as each is rebuilt. Checked with
`npm run check` and GitHub's own steps (coverage, its thresholds, the
browser smoke tests) and the build. One change beside the plan: Your pages'
rebuild now answers what it wrote and removed, which is how its test sees an
unchanged page is not written again, now that rows carry no `builtAt`.

## The rule

Proposed in the discussion that led here, for every kind of data Hakken
keeps over time:

1. **Keep what a screen reads, in the shape it reads it**: the latest
   figures, the movement columns, the graph lines.
2. **Do not keep a copy of what the source keeps for us.** Google keeps 16
   months of Search Console and answers again for free, so old detail is asked
   for when someone opens it. DataForSEO charges to ask again, so its history
   is ours to keep — as graph lines, not as every row of every purchase.
3. **Raw detail lasts only as long as something rebuilds from it**: days,
   not months.
4. **Graph lines get coarser with age**: daily, then weekly, then monthly.
5. **Nothing is kept "just in case"**: a table no screen reads is stopped or
   cleared.
6. **Every table that grows has a written rule for how long it keeps data**,
   and a job that keeps to it (part 4).

## What was measured, 2026-10-07 (dev)

**Search Console, morehandles.co.uk** (`searchConsoleTidy:keptSize`):
84.4 MB in all — the ready-made lists the screens read 42.4 MB, the
search-and-page lines for its main country 27.3 MB, the first- and last-seen
register 11.9 MB, the page list 2.3 MB, the rest under 1 MB (day totals
0.1 MB, the charts' weeks 0.1 MB). It holds 90 days: nothing older is fetched
since the switch to home countries
([search-console-home-countries-plan.md](./search-console-home-countries-plan.md)).

Rolling its days 61 to 90 into weeks, worked out from its own web lines:
those days hold 234,377 search-and-page rows as days and would hold 93,946
as weeks — 60% fewer, as the same searches come back day after day. But those
30 days are about 8.5 MB of the 25.4 MB of day lines, so the website would be
about **5 MB, or 6%, smaller** today. Worth having, not the answer on its own.

**Today is not the steady state.** It holds only its newest 90 days because
its figures were collected afresh on 2026-10-06. Each day past 90 now rolls
into a week, and each week past six months into a month, to 16 months. From
the 60% above, a week holds about three days' worth of rows; a month,
guessed at eight. So 16 months held comes to roughly **twice the 90 days
again** — about 200 days' worth of rows in all. That steady state, not
today's 90 days, is what part 3 is weighed against (step 3.1 measures it).

**Page traffic, day by day** (Anthony, 2026-10-07: "it's more than keywords
too — we have page traffic too that comes in every day … some sites have
10,000 pages a day"). It is held in Search Console's lines alone: each day's
page list, and each search with the page it brought people to. On
morehandles.co.uk the page list is small — 1,443 pages a day, 1.9 MB for 90
days, each address kept once as a number (`searchConsolePageRefs`) — and the
search-and-page lines are the bulk, 7,123 rows a day, 25.4 MB. A website
with 10,000 pages a day would hold about seven times the page list, and
search-and-page lines up to Google's 50,000 rows a day: several times
morehandles.co.uk's. DataForSEO's page tables keep only the latest, never
a day's: each page's rankings (`sitePageRanks`, rebuilt after each filing),
the sitemap's pages and the newest crawl's (`siteSitemapPages`,
`siteCrawlPages`), and Your pages (`holdPages`, rebuilt nightly).

**DataForSEO, every website on dev** (`seoStorageMeasure:measureSeoStorage`):
137.4 MB. Keyword positions (`seoKeywordPositions`) 26.4 MB in 69,193 rows;
morehandles.co.uk's keyword list of 6,355 keywords is about 2.5 MB each time
it is bought. A sample of 2,000 rows averaged **395 bytes a row**, of which
the two positions a chart draws are 8%:

| Part of the row | Share |
|---|---|
| The page address (`url`) | 20% |
| The website's and the purchase's ids | 23% |
| The row's own id and two timestamps | 26% |
| The keyword | 9% |
| Place, day, search volume | 15% |
| Position and page position | 8% |

and each row is listed again in six lookup indexes. The day tables nobody
reads are small today: `discoveredCompetitorDays` 0.2 MB in 490 rows,
`promptFanOutDays` 0.1 MB in 320.

**Why keyword positions first.** Search Console's history has a ceiling —
Google keeps 16 months, and Hakken fetches no further back than 90 days —
though a high one for a website with many pages (part 3). Keyword positions
have none: kept daily for 90 days, then each week's last check **for ever**.
A busy website's weekly keyword list alone (morehandles.co.uk) adds about
**130 MB a year, every year**, before its tracked searches' checks; a
website collected daily holds 90 daily lists on top.

## Part 1 — keyword positions as graph lines

### What there is today

One row per website, keyword, place and day (`seoKeywordPositions`,
`convex/schema.ts`), kept daily for 90 days, then thinned by the hourly sweep
to each week's last check, a list's and a check's apart, and kept for ever
(`convex/positionWeeks.ts`; `DAILY_POSITIONS_RETENTION_DAYS`,
`convex/seoCollectionPolicy.ts`;
[dataforseo-cost-plan.md](./dataforseo-cost-plan.md), B1).

**Written by** — each replacing an earlier row for the same search, place
and day (`replaceSameDayPosition`, `convex/seoKeywordChecks.ts`), each
refreshing the search's summary (`recomputeSearchStats`):

| Purchase | Where | Carries |
|---|---|---|
| The everyday ranked keywords, every collection | `writeSeoMetrics` → `fileRankedPositions` (`convex/seoCollectionParse.ts`, `convex/siteKeywordList.ts`) | position, page position, address, volume |
| The full keyword list, weekly | `writeListPage`, `writeListPositions` (`convex/siteKeywordList.ts`) | the same |
| Google checks of tracked searches, every collection | `writeKeywordCheck`, `fileFirstCheckLate` (`convex/seoKeywordChecks.ts`) | position, page position, address — and a "checked, not found" row |

A row does not say which purchase made it: a reader that needs to know looks
its purchase up (`pullId` → `seoDataPulls.operationId`).

**Read by:**

| What | Where | Reads |
|---|---|---|
| A keyword's position chart (up to 5) | `siteGoogle.searchPositions` | up to 800 rows a search over the dates; drops checks of searches the company does not track |
| The "compare with a past day" column | `siteKeywords.keywordsOnDay` → `positionOnDay` | each keyword's row on the day, or its week's last; position, page position, address |
| A search's tracking verdict | `websiteTrackingStats.recomputeSearchStats` | its newest 30 rows |
| A Hakken watch on a ranking | `hakkenWatchFigures.rankingNowInternal` | its newest row |
| The agent tool `dataforseo.metrics.read` | `seoTools.readSeoMetrics` | the website's newest 500 rows in 30 days, with volume |
| Admin → a website's keywords | `seoKeywordReports.listWebsiteKeywords` | the newest 2,000 rows in a place, newest per keyword, with volume |
| Rebuilding the latest rankings by hand | `siteBackfill.replayRankings` | every row, with address and volume |

Wins and losses, and New and lost, do not read it: they read the latest
rankings (`siteKeywordRanks`), which hold each keyword's change and previous
position.

**Cleared by:** the hourly thinning (`thinOldPositions`); a website's purge
(`websitePurge.ts`, by website and day); an untracked search's purchases
(`purgePurchase`, by purchase); the one-off competitor clean-out of list
pages past the top 1,000 (`seoCleanOut.keywordPagesStep`, by purchase); and
each re-filing of an answer, which first deletes its own purchase's rows.

### The change

**One record per website, keyword, place and month**, holding the month's
points as short lists of numbers, in place of a row per keyword per check:

- the keyword, website and place named once, not on every point;
- each point its day of the month, position and page position, and whether a
  keyword list or a check filed it — the reader no longer looks the purchase
  up;
- the page address kept only when it changes, as a short list of (day,
  address);
- search volume not repeated: it is the latest rankings' (`siteKeywordRanks`),
  where the agent tool and the admin report read it instead;
- which purchase filed each point, by a short reference into the record's
  own list of its few purchases — so re-filing an answer, a purge by purchase
  and the clean-out still work as they do;
- three lookups instead of six: by website, keyword, place and month (the
  chart, the compare column, the verdict, the watch); by website, place and
  month (the admin report, the agent tool, a website's purge); and by month
  (the coarsening).

Worked out from the measured row: a keyword checked weekly takes about
1.7 KB a month today and would take about 0.3 KB; one checked daily about
11.9 KB and would take about 0.5 KB. **About 80 to 95% smaller, and its
yearly growth with it** — to be proven on real rows in step 1.1 before
anything is built.

**Every reader goes through one module** (`positionHistory.ts`: the point
on a day, the series between two days at a day's, week's or month's step,
the newest points), so the layout is known in one place — the chart, the
compare column, the verdict, the watch, the agent tool and the admin report
change only where they ask. A guard test fails any other file reading the
new table, as `websiteTenancyGuard.test.ts` does for tracked lists.

**What a person sees does not change**, given the decisions recommended
below: the same points on every chart at every step, the same compare
column, the same verdicts and watches.

### Decisions

- **Decision 1 — how far back, how fine.** Today: daily for 90 days, then
  each week's last for ever. **Recommended: daily for 90 days as now, weekly
  to 12 months, then each month's last.** Packed, 90 daily days cost little,
  so nothing on screen changes; a month's step on a chart already shows the
  month's last day, so the old weeks become the point the chart draws anyway.
- **Decision 2 — the long tail.** Keep history for every keyword a website
  ranks for, or only for those that matter — tracked by a company, in the top
  50, or with search volume? 17% of the sampled rows were below 50th.
  **Recommended: keep every keyword, packed — unless step 1.1 finds the
  tail is still most of the size**, as a tail keyword with no history would
  chart only its latest point.
- **Decision 3 — a point only when the position changes.** It would save
  more, at the price of every reader working out the gaps. **Recommended:
  not now** — packing takes most of it; step 1.1 measures what is left.

### Steps

1. **Measure (half a day).** Pack morehandles.co.uk's and kordatackle.com's
   real rows into the new shape in a script, and record: the size before and
   after, the share of the tail, how many points do not change from the one
   before, and what each reader would read. Recorded in this plan; part 1
   goes on only if it bears out "about 80 to 95%".
2. **The new table, the module and its tests (1½ days).** Writing a point
   (replacing the same day and kind, as now); re-filing, purge and clean-out
   by purchase; the series, the day's point and the newest points; the
   coarsening of old points by Decision 1.
3. **Writing both (half a day).** Every writer files to the new table as
   well as the old, so the two can be compared on dev.
4. **The readers moved (1 to 1½ days).** One at a time onto the module,
   each checked against the old table's answer for the same keywords and
   days on dev — the same points, the same compare column, the same verdicts.
5. **History moved across (half a day).** A data migration, in pages, packing
   every website's old rows; checked by comparing a sample of charts before
   and after.
6. **The old removed (half a day).** The old table, its writes, the thinning
   and `positionThinning`, the two finished migrations that read it
   (`2026-09-22-position-places`, `2026-09-22-search-summaries`, once their
   record shows they ran everywhere), `siteBackfill.replayRankings` reworked
   or retired, and the comments and docs that describe the old shape
   ([dataforseo-data-kept.md](../../operator/dataforseo-data-kept.md),
   [dataforseo-cost-plan.md](./dataforseo-cost-plan.md) B1).
7. **Measured again** on dev and the size written into a dated record beside
   [infrastructure-costs-oct-2026.md](../../product/infrastructure-costs-oct-2026.md).

**About 5 to 6 days.**

## Part 2 — the day tables nobody reads

- **`discoveredCompetitorDays`** — a found competitor's figures, one row per
  collection. Read only for each competitor's newest day, the "last checked"
  column (`siteCompetitors.lastSeenDays`). **Change:** keep that day on the
  competitor's own row (`discoveredCompetitors`, already overwritten each
  collection), stop writing day rows, and clear the old ones.
  **Decision 4 — keep a competitor's figures over time?** No screen draws
  them today ([user-sites-plan.md](./user-sites-plan.md) lists them as
  stored, read-only). **Recommended: stop** — a competitor's trend, if one is
  ever wanted, is better drawn from its own keyword positions.
- **`promptFanOutDays`** — the searches an AI answer ran, one row each time.
  No screen reads it; it was added on purpose on 2026-09-23 so paying users
  get date-based fan-out reporting "as in Ahrefs and Semrush", and that report
  is not built. **Decision 5 — what to do until it is.** Stopping now means
  the report starts with no history when it is built. **Recommended: keep
  writing it, with a keep rule of 12 months** (part 4) — it is 0.1 MB today —
  and pack or trim it when the report is designed, by what the report reads.

**About half a day to a day.**

## Part 3 — Search Console: daily lines for 60 days

### What there is today

Each day's lines — its searches with the pages they brought people to, and
its page list, which is where a website's daily page traffic is held — are
kept as days for 90 days, then rolled into weeks to six months and months to
16 (`DAYS_KEPT`, `WEEKS_KEPT_DAYS`, `convex/utils/searchConsolePacks.ts`;
`searchConsoleRollups.ts`). They are read only to build the ready-made lists
(`buildSitePeriods`,
`convex/searchConsolePeriods.ts`) and the position-band and brand charts
(`searchConsoleWeeks`, 16 weeks back): one keyword's or one page's graph is
already asked of Google when opened (`searchConsoleKeySeries`), and so is any
dates that are not a ready-made period (`searchConsoleLiveList`).

The nightly 7- and 30-day lists, with their periods before, need the newest
60 days. Only the weekly 90-day and 12-month lists, and the 90 days' period
before, reach further.

### The change

- **Day lines kept 60 days; no weeks or months kept.** Nothing rolls up any
  more: the roll-ups go.
- **The 90-day and 12-month lists, and the 90 days' period before, asked of
  Google once a week**, as each website's weekly rebuild already runs, and
  put through the same rule of what is kept.
- **The position-band and brand charts worked out once for each finished
  week and kept**, rather than worked out again from old lines; the week
  still under way is worked out each night. A chart's day step then reaches
  60 days, its week step as far as the weeks kept.

**What it saves.** A website then holds 60 days of lines, against roughly
200 days' worth once it holds 16 months (above): **roughly 70% fewer
search-and-page and page rows** — and the more pages a website has, the more
that is: on a website with 10,000 pages a day these lines are most of its
Search Console.

**The gate first.** Google gives "a maximum of 50K rows of data per day per
search type" and advises asking one day at a time
([Getting all your data](https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data)):
one ask for 90 days on a busy website may come back with fewer rows than the
days added up — and the websites with the most pages, which save the most,
are the likeliest to. **Step 3.1 measures it on morehandles.co.uk and on the
connected website with the most pages a day**: the 90-day list from one ask
against the same list from the kept days, by rows the rule keeps and by
clicks. Part 3 goes ahead as above only if they match closely — proposed:
99% of clicks and every tracked search. Google's load limits on long asks
are checked in the same step.

**If one long ask loses too much — ask in weekly pieces:** the 90 days as 13
asks of a week, the 12 months as 52, added up while the list is built and
never stored. More asks of Google once a week (free, within its limits), the
same storage saving. Step 3.1 measures this too.

**If that loses too much as well — the fallback:** Anthony's first idea —
days rolled into weeks at 60 days rather than 90, everything else as today.
About 6% smaller on morehandles.co.uk today, more as its weeks and months
build up; the 90-day lists then end on the nearest week's edge, up to three
days either way, as the 90 days' period before already does.

**What a person sees:** the same lists; the charts' day step reaches 60 days
rather than 90. After a change of brand words, the brand chart's finished
weeks keep the split they were worked out with — unless Google's own filter
can split them again on ask, which step 3.1 checks.

### Steps

1. **Measure (1 day)**: the gate above — one long ask, then weekly pieces —
   on morehandles.co.uk and the connected website with the most pages a day;
   and the size the change would save on each once it holds 16 months,
   worked out from Google's own 16 months.
2. **The long lists asked of Google (1½ to 2 days)**, through the rule and
   the existing settle jobs; their tests against today's lists.
3. **The charts kept by finished week (1 day).**
4. **60 days, roll-ups removed (half a day)**, the weeks and months already
   kept cleared, and [search-console-plan.md](./search-console-plan.md) §14.3
   superseded in a note.

**About 3½ to 4½ days; the fallback about 1½ to 2.**

## Part 4 — a keep rule for every table that grows

One list in code of every table that gains rows over time, each with its
keep rule — kept for ever, kept so many days, thinned, or latest only — and
the job that keeps to it; a test fails a table that grows and is not on the
list, so the rule cannot drift back. The tables already kept for ever that
are graph lines or records stay so: the day summaries (`siteDaySummaries`,
`siteListAiDays`, `siteLinkDays`), who AI answers named and cited
(`aiAnswers`, `aiCitations`), and the purchases checked against DataForSEO's
invoice (`seoDataPulls`).

**Hakken tasks' daily checks, kept 90 days** (Anthony, 2026-10-07: "can you
add this to the plan"). `hakkenTaskChecks` gains a row a task a day and
nothing clears it ([hakken-tasks-plan.md](./hakken-tasks-plan.md)). An
alert reads its last 28 days, for the four weeks in its email, and each row
carries its own streak, so nothing reads further back than that. Older rows
are cleared by the hourly sweep, and the table goes on part 4's list with its
rule.

**The email queue**, when the work building it is finished: every email
Hakken sends is a row (`outboxMessages`, `convex/outboxSchema.ts`) and
nothing clears it — found on the re-check below. Its keep rule is agreed
with that work once it is finished, and goes on the same list.

**About 1 to 1¼ days.**

## Part 5 — what is stored and never read

Anthony, 2026-10-07: "what else can we reduce — can you audit the screens
again and see what could be reduced", then, on the list below: "I agree
with all of these … can you add these to the plan".

An audit of every screen, export, agent tool and Hakken task against what
is stored, on 2026-10-07: Search Console's ready-made lists and registers
(measured on morehandles.co.uk with `searchConsoleTidy:keptSize` and
`detail`), and DataForSEO's latest tables (measured on dev with
`seoStorageMeasure:measureSeoStorage`). These are not history: they are what
the screens read, or meant to — so each cut below changes nothing on screen,
except where it says.

### Search Console

**5.1 — each search's pages and each page's searches, stored twice:
about 15 MB of 84 (17%).** The ready-made `pair` and `pairByPage` lists
(8.0 MB and 6.7 MB over 7, 30 and 90 days) hold the same rows in two orders.
They are read only when someone opens one keyword or one page in Search
Console (`readKeyed`, `convex/searchConsoleLists.ts`;
`SearchConsoleRecordScreen.tsx`), and their intent, volume and estimate
columns not at all. **Change:** those two screens ask Google for every
period, as they already do for any other dates (`askGoogle` with the
keyword's or page's filter, `searchConsoleLists.ts`) — and as one keyword's
or page's graph already does (`searchConsoleKeySeries`); the two lists are no
longer built, and those held are cleared. The keyword list and Pages
competing are added up from the kept lines while being built, not from these
lists, so they do not change. **What a person sees:** a keyword's or page's
own screen takes a moment longer to open, as other dates do today.

**5.2 — Pages competing, stored long-hand: about 4 MB of its 7.9.** Its
lists write every page address out in full, where every other list keeps a
page as a short number (`pack(competing, true)` against `writeKeyed`,
`convex/searchConsolePeriods.ts`) — which is why its 90 days (4.8 MB) is
larger than the full search-and-page list it is a part of (4.5 MB); and its
positions are never read (`pagesByKeyword`, `utils/searchConsoleViews.ts`,
reads clicks and impressions). **Change:** pages as numbers, positions not
kept. The half is an estimate, measured when built.

**5.3 — what the periods before carry and nothing reads: small.** The
keyword and page lists' periods before are written with each row's count of
pages or searches and its top one (`counts`, `tops`), which only the
current period's are read for; and the countries, devices and rich results
lists keep a period before that their screens never show
(`countries-and-devices`, `rich-results`). **Change:** neither written.

**5.4 — the first- and last-seen register, never trimmed: 11.9 MB in
50,241 rows.** It records when each search and each page was first and last
shown, for New and lost (`searchConsoleSeen`, written by `noteSeen` in
`convex/searchConsoleSync.ts`; read by `searchConsoleChanges.ts` and
`searchConsoleSeenDays.ts`). It only ever grows; every page goes in, though
pages are only counted. **Change, after measuring:** pages kept as the daily
counts New and lost shows, rather than one row each; searches last shown
longer ago than Google keeps (16 months) cleared. The saving is measured
before anything is built.

### DataForSEO

**5.5 — lookup lists nobody uses.** The database keeps each table's lookup
lists (indexes) beside it to find rows fast; they take space of their own,
not counted in the sizes above. These are used by no query, checked by
search on 2026-10-07:

- the latest rankings (`siteKeywordRanks`): `by_site_intent_band_position`,
  `by_site_status_band_position`, `by_site_status_change`,
  `by_site_intent_volume`, `by_site_kd_band_position`, `by_site_cpc`, and the
  search list `search_text` — the keyword search box reads the table's copy;
- each page's rankings (`sitePageRanks`): `by_site_section_keywords`,
  `by_site_traffic`, `search_text`;
- the sitemap's pages (`siteSitemapPages`): `by_website_page`,
  `by_website_file`.

**Change:** removed. The easiest of all: no screen and no data changes.

**5.6 — columns written and never read: about 7 MB.**

| Table | Never read | About |
|---|---|---|
| The latest rankings (`siteKeywordRanks`) | the search text (`searchText`); DataForSEO's own previous position and movement (`previousPositionDfs`, `movementDfs`); `updatedAt`; the 0–1 competition figure (`competition`), sent to the keyword's screen but not shown — it shows `competitionLevel` | 5 MB of 32.7 (16%) |
| Each page's rankings (`sitePageRanks`) | `searchText`, `updatedAt`, and `volumeSum`, sent but not shown | 0.8 MB of 5.4 |
| A keyword's search features (`siteKeywordFeatures`) | the address (`url`; readers use `page`), `updatedAt` | 0.5 MB of 1.6 |
| Your pages (`holdPages`) | `builtAt` | small |
| The sitemap's pages (`siteSitemapPages`) | `day` | small |
| The pages table's copy (`siteListCopyParts`, pages) | `topKeyword` | 0.2 MB |

**Change:** each column stopped being written, then cleared from the rows
already held, then taken out of the schema — Convex's own order for removing
a field.

**5.7 — lost keywords kept for ever.** A keyword a website stops ranking
for is marked lost and kept (`siteSummaries.ts`), never removed, so a
website's rankings — and their copy — grow past the number it is allowed to
keep (`keywordsPerSite`, 1,000 by default; a competitor's 1,000 a month, cut
back only by the hand-run clean-out, `seoCleanOut.ts`). **Change:** a lost
keyword removed once it has been lost a set time, and a competitor kept to
its top 1,000 automatically. **Decision 6 — how long a lost keyword stays.**
**Recommended: 90 days**, once step 1 below has measured how many
lost rows there are and checked how far back New and lost and Wins and
losses reach.

**5.8 — the old Search Console copies.** No longer built (`gsc`,
`siteListCopies.ts`), and none left on dev on 2026-10-07; the kind is taken
out of the code.

### Steps

1. **Measure (half a day):** the lost keywords per website and how far back
   the screens reach (5.7); the register's pages and old searches (5.4).
2. **The unused lookup lists removed (half a day)** (5.5).
3. **The unused columns removed (1 to 1½ days)** (5.6), and the old copy
   kind (5.8).
4. **A keyword's and a page's screens asked of Google; the two lists gone
   (1 to 1½ days)** (5.1), checked on dev against today's figures for the
   same keywords and pages.
5. **Pages competing by page number; the periods before trimmed (1 day)**
   (5.2, 5.3).
6. **The register trimmed (1 day)** (5.4), by what step 1 found.
7. **Lost keywords and competitors kept to their limits (1 day)** (5.7).
8. **Measured again**, into the dated record with part 1's.

**About 6 to 7 days.** Steps 2 and 3 need no measurement and change
nothing on screen: they can go first of everything in this plan.

## Part 6 — Ask Hakken: only the websites you can see

Anthony, 2026-10-07, on Ask Hakken while impersonating Period House Group:
"I can see other sites in the platform. This is not good. I should only be
seeing the websites I have access to — in this instance morehandles as owned
and the sites I track. Remember Korda own 5 sites and track 20 in total, so
the UX needs to reflect this. Then we need to change the Chinese symbol to
be Hakken. Then we need to change the example prompts to things that relate
to Hakken." Then, of the drawing: "add this to the plan as it's signed off".

**Signed off 2026-10-07**, with his comments on it applied the same day: the
first question names no website ("How did my website do on Google this
month?"), the label over the greeting reads "What will you discover today",
and the message box's contents sit centred in it. The canvas, "Ask Hakken —
your websites": https://claude.ai/artifact/5jJMqxd2JUWMDGScVU561e — three
boards drawn from the app's real components on the drawing kit (stylesheet
`844c6461de95`, look `149d9f4fb243`), each passing `npm run check:drawing`.
Copies: [`boards/`](../assets/keep-less-history/boards/). They bind
([drawing-guide.md](../../developer/drawing-guide.md)): a change is drawn and
approved again first.

- **1 · As Period House Group**: answering for morehandles.co.uk, under 発見,
  with four questions about Hakken.
- **2 · Choosing a website**: morehandles.co.uk and the 7 websites it tracks
  — no other company's.
- **3 · As Korda**: its 5 websites, each with the websites it tracks folded
  beneath (on dev kordatackle.com's 11, five shown and "Show 6 more"), with
  the search at the top for a long list.

### What there is today

- **The picker lists every client.** "Answering for" is a super admin's
  choice of client (`AssistantClientPicker.tsx`; assistant-foundation-plan.md,
  item 8): it lists every company (`companies.getCompanyOptions`) and "The
  platform — no client", even while the super admin is viewing as one
  company. A company's own people see no picker.
- **A conversation is a company's, never a website's.** `chat.createThread`
  takes the client (`forCompanyId`, `forPlatform`) and nothing narrower.
- **The mark is Sonae's.** The welcome carries 備 at three per cent and the
  label "Prepared" (`AssistantHero.tsx`, `ai.assistant.welcome.stamp`) — the
  "be prepared" of Sonae (備え), the framework Hakken was cloned from, which
  AGENTS.md says is a miss wherever it is left. 備 is left on the public home
  page, the sign-in page and the admin dashboard too, and in `messages`
  ("備え · Be Prepared").
- **The four questions are generic**: summarise a document, draft a message,
  explain something, plan a piece of work.
- **The message box's contents sit on its bottom edge** (`items-end`, with
  small offsets on the shield and the send button, `AssistantComposer.tsx`).

### The change

**6.1 — the website picker.** While a super admin views as a company, the
picker lists only that company's websites — what it owns, and what it tracks
folded beneath each — through the website picker the Sites pages already use
(`WebsitePicker.tsx`: a search, "All websites", each website with its
competitors and "Show N more"). Nothing new is drawn: the list is the Sites
switcher's, whole. Two things are added to it, each said in a comment where
it is made:

- it rises above its button rather than hanging under it, since in Ask
  Hakken the button sits just above the message box at the foot of the page
  (a placement the picker takes, the Sites switcher keeping its own);
- its foot line says what choosing does: "Hakken answers with this website's
  figures".

The conversation is then about the website chosen: `createThread` takes it,
the thread keeps it, and the Assistant is told which website is meant, its
look-ups reading that website's figures unless asked about another of the
company's. The company stays the conversation's owner, so nothing about who
may read it changes. Tenant isolation is tested: viewing as one company, no
other company's website can be listed or chosen, by the screen or by a call
to the server.

**6.2 — Hakken's mark.** 発見 (discovery: the name Hakken) in place of 備,
at the same size and three per cent; the label over the greeting "What will
you discover today", in place of "Prepared"; the comment in
`AssistantHero.tsx` rewritten to say why.

**6.3 — four questions about Hakken**, the same whichever website is chosen;
picking one puts it in the message box, as now:

| | Question | Under it |
|---|---|---|
| 01 | How did my website do on Google this month? | Visitors and searches, against last month |
| 02 | Which pages gained or lost the most visitors? | The biggest changes this week |
| 03 | Do AI answers mention us, or our competitors? | ChatGPT, Gemini, Claude and Perplexity |
| 04 | Keep an eye on a page for me | Hakken checks each morning and tells you |

English and Italian together (`messages/en.json`, `messages/it.json`), the
keys renamed to what they now are.

**6.4 — the message box's contents centred**: the shield, the words and the
send arrow on the box's middle (`items-center`), the offsets gone.

**6.5 — a look test** for the signed-off screen, as the drawing guide asks of
every approved screen once built (screen-kit.md, "Approved Looks And Their
Look Tests").

### Decisions

- **Decision 7 — who gets the website picker.** As drawn: a super admin
  viewing as a company. **Recommended: a company's own people too** — the
  same list, their own company's websites — **and, for a super admin viewing
  as no one, today's list of clients unchanged.**
- **Decision 8 — the website chosen at the start.** As drawn: the company's
  own website. **Recommended: the website the person last chose in Ask
  Hakken; the first time, the company's own website, and with several (Korda's
  five) the first in the list** — "All websites" always one click away.
- **Decision 9 — 備 elsewhere.** **Recommended: 発見 on the public home
  page, the sign-in page and the admin dashboard as well, and "備え · Be
  Prepared" out of `messages`** — the same Sonae leftover; drawn first where
  the screen changes.

### Steps

1. **The website list and its placement (1 day)**: the company's websites
   for Ask Hakken, from the query the Sites switcher reads; the picker rising
   above its button; the foot line.
2. **A conversation about a website (1½ to 2 days)**: `createThread` takes
   it, the thread keeps it, the Assistant is told it and its look-ups default
   to it; the isolation tests (6.1).
3. **The mark, the label, the questions and the centred box (1 day)**: 6.2
   to 6.4, English and Italian.
4. **The look test, and `npm run check` with GitHub's own steps (½ day)**
   (6.5).
5. **备 elsewhere (½ day)**, if Decision 9 says so.

**About 4 to 5 days.** Ask Hakken is the Hakken tasks work's ground
(`AssistantComposer.tsx`, `AssistantClientPicker.tsx`, `chat.ts`), so this
part waits for that work with the rest of the plan.

## Checked, nothing to change: the raw answers

DataForSEO's answers as they came back (`seoPullAnswers`, 36 MB on dev),
kept 7 days so an answer can be filed again without buying it again
([dataforseo-data-kept.md](../../operator/dataforseo-data-kept.md)). Kept
as they are — Anthony, 2026-10-07: "this is OK".

## Checked, nothing to change: links

Anthony, 2026-10-07: "what about domains and backlinks — we don't need to
keep them each day, I think we just need the latest set … can you audit the
reports to see if that is true". It is, and it is already so.

- **The lists are the latest set only.** Each new list — backlinks, broken
  links, linking websites, anchors, servers, networks (`siteBacklinks`,
  `siteReferringDomains`, `siteAnchors`, `siteReferringIps`,
  `siteReferringSubnets`) — becomes the website's list, and the older list's
  rows are removed (`convex/siteLinkFiling.ts`, "Lists replace"). They are
  bought once a month since 2026-10-05
  (`convex/dataForSeoLinkOperations.ts`). On dev, 8.1 MB of linking websites
  and 4.5 MB of backlinks: one list a website.
- **No screen reads an older list.** Every list and record screen reads the
  current one (`siteLinkLists.ts`: the lists; `siteLinkRecords.ts`: a linking
  website's and an anchor's own screen; `siteLinks.ts`: the link profile and
  list totals, from the newest only).
- **New and lost need no older list.** A link's or linking website's status
  is DataForSEO's own, on the latest list — `is_new`, `is_lost`,
  `lost_date`, `first_seen` (`convex/dataForSeoLinkParsers.ts`) — never
  worked out by comparing two of Hakken's lists.
- **The raw answers** the lists come in are cleared after 7 days, as every
  raw answer is ([dataforseo-data-kept.md](../../operator/dataforseo-data-kept.md)).

What builds up over time is counts only, and both are graph lines — kept
under part 4's rule:

| Kept over time | Read by | On dev, every website |
|---|---|---|
| The link totals from each collection (`backlinks_summary`, in `seoWebsiteMetrics` and the day summaries) | The trend chart's points; the link profile reads only the newest | 0.3 MB, with the other summary figures |
| Links gained and lost each week, back to 2019 (`siteLinkDays`) | The Link changes chart (`siteLinkLists.linkChanges`) | 0.3 MB |

**Beside this plan — money, not storage.** The link totals are bought on
every collection, every day for a company collected daily, only to draw the
trend line; links move about 1 to 3% a week
(`dataForSeoLinkOperations.ts`). Weekly totals would draw much the same line
for fewer credits — a question for the next look at DataForSEO spend
([dataforseo-cost-plan.md](./dataforseo-cost-plan.md)).

## Beside the Hakken tasks work

Anthony, 2026-10-07: "another agent is currently working on Ask Hakken and
Telegram … if we are making schema changes you may be affecting their work —
can you take a look at what they are changing so this plan does not break
anything". Checked against the 19 commits of
[hakken-tasks-plan.md](./hakken-tasks-plan.md) on `dev` that day, the last
`6a447003` (Telegram):

- **Their schema changes touch none of this plan's tables.** They added
  tables of their own — the tasks and their daily checks
  (`hakkenTaskSchema.ts`), Telegram's links, codes and bot
  (`telegramSchema.ts`) — and optional fields on chat messages (a chart, a
  task proposal) and a limit (`hakkenTasksPerPerson`).
- **Part 1 meets one of their readers.** The Watcher's Google-rankings alert
  reads a search's newest position straight from `seoKeywordPositions`
  (`hakkenWatchFigures.rankingNowInternal`), on its morning round
  (`hakkenWatcherActions.ts`) and when Ask Hakken sets an alert up
  (`assistantTaskHandlers.ts`); its test writes position rows directly
  (`hakkenWatches.test.ts`). It is in part 1's list of readers: step 1.4
  moves it onto the module, and its test with it. Nothing else of theirs
  reads position history — an alert's four weeks in its email come from the
  task's own daily checks (`hakkenTaskChecks`).
- **Parts 3 and 5 keep what they read.** The Assistant
  (`assistantReads.ts`), the Stat Report Agent (`hakkenStatReporter.ts`) and
  a task's figures (`hakkenTaskFigures.ts`) read Search Console's page lists,
  now and the period before, for clicks and the clicks before, through
  `readList` — kept. Part 5.3 drops only the period before's counts and top
  rows, which they do not read; 5.1 only the search-and-page lists, which
  they do not read. Their charts and an alert's 28-day trial read the daily
  totals (`searchConsoleDays`, unchanged) or, for one page, ask Google.
- **Part 4 takes in their growing table.** `hakkenTaskChecks` gains a row a
  task a day and nothing clears it: kept 90 days, in part 4.
- **Not started until they have finished** (Anthony, 2026-10-07: "we will
  wait until they finished before we start this"). Both pieces of work edit
  `convex/schema.ts` and run in the same folder on `dev`, where one's
  unfinished files can fail the other's checks (on 2026-10-07 this plan's
  checks failed on their unfinished chart). So this plan starts once the
  Hakken tasks work is finished and committed. Even then it is built in a
  worktree of its own, on its own branch, and merged into `dev` when green.

**Re-checked against the code later the same day** (Anthony: "can you
double check the code against the schema again and see if it needs
changes"). No commits since `6a447003`; the other agent's work in progress —
the email queue and its agent (`outboxQueueAgent.ts`, `outboxSchema.ts`) —
touches none of this plan's tables or readers. Every claim still holds:

- the positions table's fields and six lookups are unchanged, and the same
  16 files use it, with `positionOnDay` read only by `siteKeywords.ts`;
- the competitor and fan-out day tables keep the same readers;
- `DAYS_KEPT` 90, `WEEKS_KEPT_DAYS` 183, the 7-, 30- and 90-day periods
  before, and the weekly 90 days and twelve months are as described, and only
  `buildSitePeriods` reads the kept lines;
- the paired lists are read only by a keyword's or page's own screen
  (`readKeyed`), and Pages competing still packs addresses long-hand;
- the nine lookup lists of 5.5 have no use outside the schema, and no
  search list is queried on the rankings or page rankings (the other
  `by_site_traffic` uses are on `siteKeywordRanks` and `sitePaidKeywords`,
  not `sitePageRanks`);
- the columns of 5.6 are only written or passed along
  (`previousPositionDfs`, `movementDfs`: `rankExtrasOf`), and the keyword
  screen's "competition" shows the level, never the 0–1 figure;
- lost keywords are still kept, and the `gsc` copy kind is still in the
  code.

One addition: the email queue grows and nothing clears it — added to
part 4.

## Order — the phases

Nothing starts until the Hakken tasks work is finished. Then, in this order:

| Phase | What | Days |
|---|---|---|
| 1 — Quick wins | Part 5's unused lookup lists and columns, and the old copy kind (5.5, 5.6, 5.8): no measurement, nothing on screen changes | 1½–2 |
| 2 — Ask Hakken: your websites | Part 6, signed off: the website picker, a conversation about a website, 発見, the four questions, the centred box; 備 elsewhere if Decision 9 says so | 4–5 |
| 3 — Keyword positions | Part 1: one record a keyword a month; measured first | 5–6 |
| 4 — Day tables | Part 2: competitors' day rows stopped, fan-out days kept 12 months | ½–1 |
| 5 — Search Console, 60 days | Part 3: the gate first; the fallback if it fails is 1½–2 | 3½–4½ |
| 6 — A keep rule for every table | Part 4, with the task checks and the email queue | 1–1¼ |
| 7 — The rest of part 5 | Measured first; a keyword's and page's screens asked of Google, Pages competing, the periods before, the register, lost keywords (5.1–5.4, 5.7) | 4½–5 |
| **All** | | **20–25** |

Phase 2 comes early because it is signed off and is what people see; it
stands apart from the storage phases and can move to first or last without
changing them. Each phase is checked with `npm run check` and GitHub's own
steps, and its storage measured before and after; nothing is pushed until
Anthony asks.
