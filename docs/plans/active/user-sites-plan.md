# Sites — what a client sees for each website they track

**Started 2026-09-23. Status: planned, nothing built.** Owner decisions are
recorded below; change them here, with a date, before building anything that
disagrees with them.

This is the user front end for Hakken's SEO data: a client opens **Sites**,
picks one of their websites and reads everything we collect about it, the way
they would in Semrush or Ahrefs. It is written to be built by someone — or
some model — with no other context. Follow `AGENTS.md`. Anchors carry the file
they rest on; verify them before editing, because files move.


> **2026-09-26.** The searches and questions a site is measured on are now
> each company's own ([private searches and questions](private-tracking-lists-plan.md)).
> D1 holds — they are still edited in admin only. D13 changed with Anthony's
> agreement: the admin's Google searches and AI questions moved from the
> shared website record to the company's own screen for the site. D17's
> "this company's questions only" is now true by construction: every Sites
> read of a list goes through the company's own hold.

## The rule that governs this plan

**Show the data we collect first. Features go on top afterwards — and collect
thoroughly.**
Anthony, 2026-09-23: "we have to show the data we collect as the base layer
before we add more features on top."

So every page in this plan is fed by DataForSEO data: either a call we already
make, or one of the extra calls listed under "Collecting more" (D10), which
this plan adds to the collection. No page is added for data we cannot get. Diagnosis, "what to fix",
alerts, and traffic or leads (Search Console, GA4) are later layers and are
**out of scope** here. This also keeps the product on the right side of
PRODUCT.md §13: this is not a Semrush clone, it is the honest base layer the
rest of Hakken is built on.

## Owner decisions (2026-09-23)

| # | Question | Decision |
|---|---|---|
| D1 | Who edits a site's searches, questions and competitors? | **Admin only, for now.** The Sites pages are read-only. Editing stays on the website record and the company site screens in admin. |
| D2 | Can a client open a competitor as if it were their own site? | ~~**No.** Competitors are only ever shown beside the client's own site.~~ **Replaced by D17 on 2026-09-23:** yes, every held website opens the full set of pages. |
| D3 | Date ranges? | **Yes.** Every page has 7 / 30 / 90 days and a custom date picker. |
| D4 | How are the pages reached? | **A side menu**, one item per page. |
| D5 | How is the side menu grouped? | **One sub menu per kind of content we collect** — five, one per DataForSEO call family — plus Overview. |
| D6 | Suggested rivals on a read-only site? | **Keep the page**, read-only. Adding one stays in admin. |
| D7 | Share of voice counts only rivals we know by name | **Accepted.** The page says so: "against your tracked competitors". |
| D8 | Charts | **A full range of bar and line charts**, designed as if two years of data were already collected. See "Charts". |
| D9 | Store the AI answers? | **Yes.** Answers are kept and shown, because strategies are made from them. This reverses the earlier "keep no answer text" rule on purpose. See "Stored answers". |
| D10 | How much data? | **Be thorough and collect as much as we can.** Read out everything in what we already buy, and buy the extra DataForSEO calls that fill the gaps (link lists, history). Paid calls stay behind the Collector's spend cap. See "Collecting more". |
| D11 | Chart style | **Like Ahrefs:** tick boxes choose which measures are drawn, a Competitors overlay adds rivals as lines, a Years view compares this year with last, and the viewer picks daily, weekly or monthly. |
| D12 | Tables | **Every table can compare two dates** ("23 Sep vs 23 Aug") and shows the change, New and Lost; keyword and page tables have **filters** for every column we hold. |
| D13 | Admin or user front end? | **Admin is settings and data collection. The user front end displays what comes back. The admin UI stays exactly as it is.** Anthony, 2026-09-23. See "Admin and the user front end". |
| D14 | Finding things in big tables | **Every table has a search box and filters.** Some sites rank for tens of thousands of keywords and pages; a client must reach any row in a few seconds. Anthony, 2026-09-23. See "Tables". |
| D15 | Speed | **Every screen is built for speed on the server** — indexes, paging, summaries, page-load targets — across all of them. Anthony, 2026-09-23. See "Speed". |
| D16 | Downloading charts | **Every chart can be downloaded, in light or dark to match the theme switcher.** Anthony, 2026-09-23. See "Downloads". |
| D17 | Which websites are Sites? | **Every website the company holds — owned or competitor — is a Site, listed on `/app/sites`, and any of them opens the full set of pages.** Anthony, 2026-09-23: "I'm expecting to see all of these sites on the front end and then see all 33 screens for any of the sites I choose." This **replaces D2**: a competitor is no longer only a comparison beside the owned site. See "Which websites are Sites". |

## Which websites are Sites (D17)

The admin **Websites** screen for a company lists every website it holds:
its own (`relationship` `OWNED`) and the ones it watches (`COMPETITOR`, each
"of" an owned site). Anthony, 2026-09-23: the client front end shows **all of
them**, and every one opens the same pages.

- `/app/sites` lists every hold of the company, owned and competitor, with the
  same columns for each: type (Owned, or Competitor of which site), AI
  mentions, top 3, estimated traffic, to do, last checked, added.
- Opening any of them gives the full side menu and every page, drawn for that
  website. A page that says "you" on an owned site says "this site" on a
  competitor; the copy never assumes the reader owns the site.
- **Rivals on a page are the company's other holds.** On an owned site they
  are its competitors, as before. On a competitor's pages they are the owned
  site and the other competitors, so Share of voice, Side by side, Content gap
  and Compared with rivals work the same way whichever site is open.
- A website that has not been checked yet (added, first collection still to
  run) still opens: its header says when the first check runs and every figure
  reads as not yet checked, never as zero.
- The site switcher in the page header moves between all of the company's
  holds.
- The tenancy rule is unchanged: every one of these is a hold of the caller's
  company, checked through `requireSite`; the shared website record is still
  never the entry point.

## Where it lives

- A new **Sites** item in the user app sidebar
  (`src/ui/components/layout/SidebarNavigation.tsx`, next to Calls).
- `/app/sites` — every website the company holds, owned and competitor (D17).
- `/app/sites/[siteId]/…` — one site, with the side menu below. `siteId` is
  the company's hold (`companyWebsites._id`), never the shared `websites._id`.
- The date range and step live in the URL (`?from=…&to=…&step=day|week|month`,
  default last 30 days, daily) so every page, link and refresh keeps them.

## Admin and the user front end (D13)

Anthony, 2026-09-23: "admin is about settings and data collection, user front
end is about displaying the information we get back."

- **Admin** — the website record, its searches, questions, brand names and
  profile; each company's sites, competitors and schedule; the Planner and
  Collector agents, the queue, costs and the test-data reset. Everything in
  "Collecting more" lands here: new calls, their cadence and their caps.
- **User front end** — the Sites pages in this plan. Every chart and table of
  collected data lives here, once.
- **The admin UI does not change.** Anthony, 2026-09-23: "don't change
  anything in admin — I want the admin UI as it is, I'm happy with it." Its
  existing screens, including the company site Results tabs, stay exactly as
  they are. This plan builds nothing new in admin and removes nothing from it.
  The only admin-side work is behind the screens: the new DataForSEO calls go
  into the collection (registry, Planner, Collector), the test-data reset and
  the website purge.
- **A super admin sees Sites as the client does**, by opening the company's
  Sites pages; admin never gets its own copy of them.

## The side menu — every page and where its data comes from

Status key:

- **✅ stored** — already read into our own tables, by day.
- **🔧 in raw** — in a DataForSEO answer we already buy and keep in
  `seoDataPulls.resultJson`; nothing reads it out yet. Free.
- **💷 new call** — a DataForSEO call we do not make yet. Added by this plan
  (D10); costs money each time it runs. See "Collecting more".
- **🤖 judged** — worked out by Jev from data we hold; a fraction of a cent,
  judged once and remembered.

Where an Ahrefs page has no DataForSEO equivalent it is listed at the end
under "Not available", so nobody goes looking.

### Overview

| Page | Shows | Source | Status |
|---|---|---|---|
| Overview | Headline numbers for the chosen dates and what changed; the Ahrefs-style performance chart (D11) with tick boxes for estimated traffic, traffic value, ranking pages, keywords, backlinks, linking websites, domain rank, crawled pages; the position-bands chart under it | `seoWebsiteMetrics` (per day: `rankedKeywords`, `estimatedTraffic`, `top3`, `backlinks`, `referringDomains`, `rank`, `brokenBacklinks`); the rest from the pages below | ✅ stored / 🔧 in raw |
| Calendar | What changed on each day: rankings won and lost, AI mentions gained and lost, links gained and lost | history of every table below | ✅ stored (grows as the others do) |

### 1. AI answers — ChatGPT, Perplexity, Gemini, Claude (`ai_citation_*`)

| Page | Shows | Source | Status |
|---|---|---|---|
| Mentions | Per question and engine: named, recommended, warned against or not named, over time | `aiAnswers`, `aiCitations` | ✅ stored |
| Share of voice | How often this site is named against its tracked rivals, per engine | `aiAnswers.named` | ✅ stored — labelled "against your tracked competitors" (D7) |
| Full answers | What the engine actually said | answer text in `seoDataPulls.resultJson` | 🔧 in raw — kept from now on (D9) |
| Sources cited | Which of this site's pages the engines link to | `aiCitations` (kind `SOURCE`) | ✅ stored |
| Fan-out queries | The searches the engines ran behind the scenes. Called "What the AI searched" until 2026-09-25, when Anthony asked for the industry's own term | `promptFanOutQueries`, `promptFanOutDays` | ✅ stored |

### 2. Google results — the first hundred results for each tracked search (`serp_google_organic`)

Page one only until 2026-09-24; every check now reads down to position 100
(see "Storing everything" below).

| Page | Shows | Source | Status |
|---|---|---|---|
| Your searches | Each tracked search: position, trend, last checked | `seoKeywordPositions`, `websiteSearchStats` | ✅ stored |
| Wins and losses | Searches that moved up or down in the dates chosen | `websiteMoves` | ✅ stored |
| Who ranks above you | The full page one for each tracked search | SERP `items` | 🔧 in raw |
| Search features | Where Google shows an AI Overview, map pack, featured snippet, "People also ask" | SERP `item_types` | 🔧 in raw |
| Questions people ask | "People also ask" and related searches | SERP `people_also_ask`, `related_searches` | 🔧 in raw |

### 3. Organic keywords — everything the site ranks for (`domain_ranked_keywords`)

Renamed on 2026-09-26: the menu group is **Organic search**, and All keywords
is **Keywords** — the menu item and the page's title. The sort dropdown gave
way to headings pressed to sort (docs/plans/active/sites-ux-updates-plan.md,
change log).

| Page | Shows | Source | Status |
|---|---|---|---|
| All keywords | The table below, with filters (D12) and a position-bands chart over time | see columns | ✅ / 🔧 |
| Top pages | The table below, with a chart of ranking pages and traffic (D11) | see columns | ✅ / 🔧 / 🤖 |
| Position bands | How many keywords are 1–3, 4–10, 11–20, 21–50, 51+ over time (DataForSEO's finer bands, grouped) | `metrics.organic.pos_*` | 🔧 in raw (`top3` ✅) |
| New and lost | New, up, down and lost keyword counts | `metrics.organic.is_new/is_up/is_down/is_lost` | 🔧 in raw |
| Site structure | Keywords, traffic and pages by section of the site (`/news`, `/services` …) | page addresses in `seoKeywordPositions.url` | ✅ stored (traffic 🔧) |

**All keywords — columns** (modelled on Ahrefs' Organic keywords):

| Column | Source | Status |
|---|---|---|
| Keyword, position, ranking page, search volume, updated | `seoKeywordPositions` | ✅ stored |
| Position change (9 → 1, ▲8), New, Lost | two dates compared (D12) | ✅ from history |
| Ranking page changed (old page crossed out) | two dates compared | ✅ from history |
| Intent | `seoKeywordIntents` — our own buying / researching / branded judgment | ✅ stored |
| Difficulty (KD), cost per click, monthly search trend | `keyword_data.keyword_properties`, `keyword_info` | 🔧 in raw |
| Estimated traffic from the keyword | `serp_item.etv` | 🔧 in raw |
| Search features on its results page (count and which) | `serp_info`, `serp_item_types` | 🔧 in raw |
| Filters | position, volume, intent, difficulty, cost per click, traffic, page | ✅ / 🔧 |

**Top pages — columns** (modelled on Ahrefs' Top pages):

| Column | Source | Status |
|---|---|---|
| URL, keyword count, top keyword, New, Lost | `seoKeywordPositions` | ✅ stored / from history |
| AI responses per engine — which engines cite the page | `aiCitations` (kind `SOURCE`, by URL) | ✅ stored — Ahrefs locks this; we have it |
| Page rank (DataForSEO's page score, 0–1000; Ahrefs' "UR" is 0–100, so numbers will not match) | `serp_item.rank_info.page_rank` | 🔧 in raw |
| Linking websites and backlinks to the page | `serp_item.backlinks_info` | 🔧 in raw |
| Estimated traffic, share of the site's traffic, traffic value | `serp_item.etv`, `estimated_paid_traffic_cost` | 🔧 in raw |
| Page type (home, service, blog, case study, contact …) | page address and title, judged by Jev | 🤖 judged |

Page rank and link figures exist only for pages that rank for at least one
search, which is every row of Top pages.

### 4. Competitors — sites ranking for the same searches (`domain_competitors`)

| Page | Shows | Source | Status |
|---|---|---|---|
| Side by side | This site against each tracked rival: searches won, AI answers | `websiteSiteRows.loadRivalRows` | ✅ stored |
| Organic competitors | Every site ranking for the same searches: overlap, average position, their traffic and keywords | `discoveredCompetitors`, `full_domain_metrics` | ✅ stored / 🔧 in raw |
| Content gap | Searches the tracked rivals rank for that this site does not | the rivals' own `domain_ranked_keywords` against this site's | ✅ stored (we collect every tracked rival's keywords) |
| Market map | Traffic and keyword count, this site against rivals | `full_domain_metrics` | 🔧 in raw |
| Suggested rivals | Sites we found, with what kind of site each is | `discoveredCompetitors`, `discoveredCompetitorDays` | ✅ stored — read-only (D6) |

### 5. Backlinks — links from other websites (`backlinks_summary`, `bulk_*`, and the new calls)

| Page | Shows | Source | Status |
|---|---|---|---|
| Summary | Domain rank, backlinks, linking websites, over time | `seoWebsiteMetrics` (`backlinks_summary`) | ✅ stored |
| Compared with rivals | Rank, backlinks and linking websites for the site and its rivals | `bulk_ranks`, `bulk_backlinks`, `bulk_referring_domains` | ✅ stored |
| Link quality | Spam score, broken backlinks, broken pages | `backlinks_spam_score`, `broken_*` | 🔧 in raw (`brokenBacklinks` ✅) |
| Where links come from | By country, domain ending (.com, .tv …), site type (blog, news, shop) | `referring_links_countries`, `_tld`, `_platform_types` | 🔧 in raw |
| All backlinks | Every link: linking page, anchor text, follow / nofollow, first seen, lost | Backlinks list call | 💷 new call |
| Referring domains | Every linking website, with its rank and link count | Referring domains list call | 💷 new call |
| Anchors | The words other sites use to link here | Anchors list call | 💷 new call |
| Referring IPs | Links grouped by server and subnet (spots link networks) | Referring networks call | 💷 new call |
| Broken backlinks | Links pointing at pages that no longer work — the ones worth fixing | Backlinks list call, filtered to broken | 💷 new call |
| New and lost links | Links gained and lost over time | new / lost time-series call | 💷 new call |

### Not available from DataForSEO

| Ahrefs page | Why |
|---|---|
| Linking authors | DataForSEO does not offer it. |
| Impressions, clicks | Need Search Console — a later layer, not this plan. |
| Ahrefs' own scores (DR, UR) | Theirs. We show DataForSEO's rank and page rank instead, on their own scale. |

**Thirty-two pages: Overview and Calendar plus five sub menus.** Pages marked
💷 wait for Phase 4; the rest are built from data we already buy. Phase 5
added three (Site audit, Paid search and Paid keywords), so the menu holds
thirty-five — see the build log.

## Collecting more (D10)

Anthony, 2026-09-23: "we need the data to be thorough and collect as much as
we can." So this plan adds DataForSEO calls, not just pages.

**New calls** (endpoints to verify against DataForSEO's documentation before
they go into `convex/dataForSeoRegistry.ts`):

| Call | Fills | How often |
|---|---|---|
| Backlinks list (`/v3/backlinks/backlinks/live`) — one link per linking website by default, and a broken-only pass | All backlinks, Broken backlinks | weekly |
| Referring domains (`/v3/backlinks/referring_domains/live`) | Referring domains | weekly |
| Anchors (`/v3/backlinks/anchors/live`) | Anchors | monthly |
| Referring networks (`/v3/backlinks/referring_networks/live`) | Referring IPs | monthly |
| Backlink new / lost over time (`/v3/backlinks/timeseries_new_lost_summary/live`) | New and lost links | weekly |
| ~~Backlink history (`/v3/backlinks/timeseries_summary/live`)~~ | ~~Two years of backlink and linking-website history, at once~~ | **Withdrawn 2026-09-23** — no backfilling (see below) |
| ~~Ranking history (`/v3/dataforseo_labs/google/historical_rank_overview/live`)~~ | ~~Two years of monthly traffic, keyword counts and position bands, at once~~ | **Withdrawn 2026-09-23** — no backfilling (see below) |

**No backfilling (2026-09-23).** The two history calls above were to give the
two-year charts real data on day one. Anthony withdrew them the same night:
"We are not backfilling the data as part of this plan — we are coding as if we
have the data … so we don't spend a fortune backdating all the data." So the
screens are built for two years of data, and the data arrives from our own
collection from now on. Neither call is in the registry; nothing collects
them. (Before the message arrived, the night's testing had bought them once
for each of the five sites, $0.89 in all; those answers are filed and stay.)

**How the new calls are run — the same rules as every call today:**

- Planned by the Planner agent and sent by the Collector agent, never by a
  button or a cron (`docs/plans/active/websites-and-competitors-plan.md`;
  `convex/seoAgentRuns.ts`). Their cost shows in the agent's run, logs and
  Observability.
- The Collector's spend cap per run (`agents.maxCostUsd`) applies to them.
- **One test call first** for each new call, on one site, to record its real
  price in the running cost table before it is switched on for everyone.
- **Row caps.** Lists can be huge (pixelfield.co.uk shows about 34,000 backlinks,
  most from `.tv` spam), so each list call has a row limit and asks for one
  link per linking website unless a page needs every link.
- Each call's own cadence (the column above) — link lists do not change daily.
- Every new table goes into `convex/seoTestDataReset.ts` and
  `convex/websitePurge.ts` in the same change.

**More we can buy later — each needs its own go after a price test:**

- **Paid search estimates** — which keywords a site buys ads on, and an
  estimated spend (DataForSEO Labs). Ahrefs' "Paid search" section.
- **Site crawl** — DataForSEO On-Page: page inspect, internal and outgoing
  links, broken pages on the site itself, a technical audit. Ahrefs' "Page
  inspect", "Internal links" and "Outgoing links".

## Charts (D8, D11)

Bar and line charts, built with the chart library already in the app
(`recharts`, with `src/ui/components/charts/` — `chartPalette.ts`,
`ChartTooltip.tsx`, `ChartExportWrapper.tsx`). No second chart library.

**Like Ahrefs (D11):**

- **Tick boxes** choose which measures a chart draws; several can show at once,
  each on its own scale where they differ.
- **Competitors overlay** — the tracked rivals as extra lines on the same chart.
  We collect the same figures for every tracked rival, so this needs no extra
  call.
- **Years view** — this year against last year, once a year of data exists
  (from our own collection; no history is bought — no backfilling, 2026-09-23).
- **Step picker** — the viewer picks daily, weekly or monthly; the date range
  picks a sensible default (up to 90 days daily, up to a year weekly, longer
  monthly).
- **Stacked position bands** under the performance chart, as in Ahrefs.

**Design for two years of data from day one:**

- **Line charts for anything over time**: positions, AI mentions per engine,
  share of voice, estimated traffic, keyword counts, backlinks, linking
  websites, domain rank.
- **Bar charts for anything split into groups**: position bands, keywords by
  intent, mentions by engine, wins against losses, links by country, domain
  ending and site type, this site against each rival.
- **Charts read summaries, never raw rows.** Two years of one site's keyword
  rankings is several hundred thousand rows. Each chart reads a small summary
  table kept by day, week and month, written when a result is filed — the
  same way `seoWebsiteMetrics` already keeps one row per site per day. A chart
  that has to scan raw rows is a bug.
- **Every chart can be downloaded** (D16, see "Downloads"), and has a plain
  table view underneath for anyone who wants the numbers.
- **Colours from `chartPalette.ts` only** — no hardcoded colours
  (`src/theme-drift.test.ts`).
- **Not enough data yet** is said in words ("Charts fill in as more checks
  run"), never shown as a flat line that looks like no change.

## Tables (D12, D14)

- **Search and filter on every table (D14).** A search box above every table
  (keywords, pages, questions, linking sites, anchors — whatever the first
  column holds, and the page address where there is one), then a filter for
  each column we hold (position, volume, intent, difficulty, cost per click,
  traffic, page type, New / Lost, follow / nofollow …), a sort, and a count of
  results. Search and filters stay in the URL, so a filtered view can be
  bookmarked and shared.
- **Compare two dates.** Every table has a "this date vs that date" picker, like
  Ahrefs ("23 Sep 2026 vs 23 Aug 2026"). Rows show the change between them,
  and New and Lost where a row exists on only one side.
- A filter for a column we do not hold is not shown.
- **Last checked** in its own column on every table.
- 15 rows per page, `DataTable` from the screen kit, export to CSV.

## Speed (D15)

Sites is built for sites with tens of thousands of keywords, pages and links,
and two years of history. Anthony, 2026-09-23: "these screens need to be
server-side optimised — indexes, page speed and page load time — across all
of them." These rules apply to every Sites query and page.

**The server does the work; the browser gets one page.**

- Every table is searched, filtered, sorted and paged **on the server**, and
  only the rows on screen (15) are sent. Use cursor pages through
  `useServerPagedTable` (`src/hooks/useServerPagedTable.ts`) over a Convex
  paginated query. **Never** `paginateItems` (`convex/adminQueryService.ts`),
  which loads every row and slices it in memory — fine for a list of twenty
  companies, fatal for 40,000 keywords.
- **No query reads more documents than it shows**, give or take a small, fixed
  margin. A query that scans a site's rows to filter or count them is a bug.

**Indexes for every way a table can be read.**

- Each sort and each common filter has its own index, led by the site and the
  day it reads (for example keywords by site, day and position; by site, day
  and volume; by site, day and traffic), so a filter is a range read on an
  index, not a scan.
- Search uses Convex **search indexes** (`searchIndex`, as `websites` already
  has for its host) on keyword text and page address, with the site and day
  as filter fields.
- A filter combination with no index of its own is not offered until it has
  one.

**Latest view and history kept apart.**

- The tables read a **latest snapshot** per site — the most recent check of
  each keyword, page and link — kept up to date when a result is filed, so a
  table never has to find "the newest row per keyword" across two years of
  rows.
- Changes between two dates (D12) read the two dates' rows by index, not the
  whole history.
- Charts read the day, week and month **summaries** (see "Charts"), never raw
  rows.

**Counts and totals are stored, not counted.** "807 keywords", "Page 1 of
54", the side menu's numbers and the Overview figures come from summary rows
written when data is filed. Nothing counts 40,000 rows on page load. A
filtered count is stored where the filter is common, and otherwise shown as
"more than N" rather than counted.

> **Changed 2026-09-25 — built the same day.** [Numbered table pages](sites-table-pages-plan.md)
> counts totals from a compact copy of each big list (a few records, never the
> rows), so every Sites table shows its exact total, and moves the Sites tables
> from fifteen rows a page to 25, 50, 75 or 100, opening at 25. Every Sites
> table now works that way.

**Page load.**

- **Targets:** the page frame and header on screen in under 1 second; each
  table's first page and each chart in under 1 second after that, on a site
  with 50,000 keywords and two years of history.
- Each page loads only its own data; nothing loads the other 31 pages' data.
- Charts load the chart library only on pages that draw one, and every table
  and chart shows a skeleton while it loads, never an empty box.
- Search waits for typing to pause (`useDebounce`, `src/hooks/useDebounce.ts`)
  before asking the server.
- Large exports (every keyword as CSV) are made on the server and handed over
  when ready, never built in the browser.

**Proven, not assumed.** A test seeds one site with 50,000 keywords, 5,000
pages, 20,000 backlinks and two years of summaries, and checks that every
Sites query reads a bounded number of documents and returns within the
targets. It runs before each phase is called done.

## Downloads (D16)

Anthony, 2026-09-23: "I would like all charts to be downloadable in light or
dark mode depending on the switcher."

- **Every chart has a download button**, always visible in the chart's header
  — not revealed on hover, which a phone cannot do.
- **Three formats:** PNG (for slides and reports), SVG (sharp at any size), and
  CSV (the numbers behind the chart, for the dates and step chosen).
- **Light or dark follows the app's theme switcher** (`next-themes`, as the
  sidebar uses it). Whatever theme the viewer is looking at is the theme the
  file is drawn in; switch the theme and the next download follows.
- **Colours come from the theme tokens**, not literals: the file's background
  is the theme's card colour and every line, bar, label and gridline its chart
  colour, so a light download is a proper light chart, not a dark one on
  white.
- **A downloaded chart stands on its own:** it carries its title, the site,
  the dates and step, the legend, and "Hakken" in small type, so it can be
  dropped into a report without explanation.
- **File names say what they are:**
  `ronins.co.uk-estimated-traffic-2026-08-24-to-2026-09-23.png`.
- **Built by extending the existing `ChartExportWrapper`**
  (`src/ui/components/charts/ChartExportWrapper.tsx`), which already follows
  the theme through `useTheme` but hardcodes its backgrounds (`#0d0d0d` /
  `#ffffff`), shows its button only on hover and offers PNG only. Extend it
  with options that Sites turns on, and say so in a comment. The defaults stay
  exactly as they are, so the admin charts that already use it look and behave
  the same (D13: no admin screen changes).
- Tables keep their own CSV export (see "Tables"); big ones are built on the
  server (see "Speed").

## Stored answers (D9)

Anthony, 2026-09-23: "we need to show the answers — we need to make
strategies from this." The earlier rule in `convex/dataForSeoParsers.ts`
(above `parseLlmResponse`) kept no answer text, so that nothing another AI
wrote could reach an agent's prompt. That rule is reversed on purpose:

- Each answer's text is stored with the answer (`aiAnswers`), by day, and
  shown on the Full answers page.
- The parser comment is rewritten to say the text is now kept and why, citing
  this decision, so nobody "fixes" it back.
- Answers stored before this change have no text; the stored raw results can
  fill in the days still held, for free.
- When an agent later reads answers to build a strategy, the text is passed as
  quoted material to analyse, never as instructions to follow. That belongs to
  the strategy work, not to this plan, but it is the condition the old rule
  was protecting, and it is written here so it is not lost.

## Phases

Each phase is shippable on its own and the app is green (tests, types, lint,
guards) at every boundary. Report progress as a percentage of the whole plan
and of the phase, per `AGENTS.md`.

### Phase 1 — the shell and the stored pages (about 25% of the plan)

1. `/app/sites` list: one row per held website, owned and competitor (D17)
   — type, AI mentions, top-3 and page-one counts, what moved, last checked.
2. The site layout: title, the side menu (D4, D5), the shared date range and
   step control that writes the URL, and the compare-two-dates control (D12).
3. Every page marked ✅ stored, filtered by the date range.
4. Every other page appears in the menu, greyed, labelled "Coming soon". The
   menu stays one shape from day one, so nothing moves when pages arrive.

### Phase 2 — read out what is in the raw answers (about 20%)

Store the AI answer text (D9) and write the chart summaries (D8). Extend the
parsers in `convex/seoCollectionParse.ts` and `convex/dataForSeoParsers.ts` so
every 🔧 field is written to our own tables, **by day**, the same way
`seoWebsiteMetrics` already is. Add the 🤖 page-type judgment. Re-read the
stored results so existing days are filled in — free, no new DataForSEO call.
Each new table goes into `convex/seoTestDataReset.ts` and the website purge in
`convex/websitePurge.ts` in the same change (the `aiAnswers` miss, fixed
2026-09-23, is why).

### Phase 3 — the pages and charts on that data (about 20%)

Turn each 🔧 and 🤖 page on, and add the Ahrefs-style charts (D8, D11) to every
page that has a time series or a split.

### Phase 4 — collect more (about 25%)

Add the new calls under "Collecting more" to the registry, the Planner and the
Collector; one test call each to record the price; ~~run the two history calls
once per site~~ (withdrawn 2026-09-23: no backfilling); then turn the 💷 pages
on.

### Phase 5 — more we can buy (about 10%)

Paid search estimates and the site crawl, each only after its own price test
and go.

## Rules for building these pages (drift guards)

- **The tables above are the contract.** A page or column that is not in them
  is not built; one that needs data not in them is a new decision, recorded
  here first.
- **Read-only (D1).** No add, remove, track or dismiss buttons on Sites.
- **Sites are company-scoped and dynamic.** Anthony, 2026-09-23: "the
  websites are company scoped so will be dynamic, and one company cannot see
  another company's sites."
  - The Sites list is whatever the signed-in user's company holds
    (`companyWebsites`, owned and competitor alike — D17), read at request
    time — never a fixed list.
  - The company comes from the caller (`ctx.companyId`, from `tenantQuery` in
    `convex/tenantFunctions.ts`, which honours super-admin impersonation),
    **never from the URL**. The `siteId` in the URL is checked against it: a
    hold that belongs to another company answers "not found", exactly as a
    missing one does, so an address cannot be guessed into another client's
    data. Use `requireTenant` and `assertTenantAccess` on the hold before
    reading anything else.
  - Every query enters through that hold, as the admin site screens do
    (`convex/websiteSiteRows.ts` `requireSite`). Never start from a shared
    table (`websites`, `aiAnswers`, `seoKeywordPositions` …) and walk outward.
    The website record is shared between companies that watch the same host;
    which companies watch it, and whom each compares it with, never reaches
    another company's screen.
  - Admin `superAdminQuery` functions are not reused for the user side.
  - **A test for every Sites query** proves another company's user gets "not
    found" for a site that is not theirs, and that two companies watching the
    same host each see only their own rivals.
- **A page is about the open site (D17).** Any held website, owned or
  competitor, can be the open site; the other holds appear beside it as
  comparison. A website the company does not hold never appears as a page.
- **The admin UI stays as it is (D13).** No admin screen is added, changed or
  removed by this plan.
- **Every paid call goes through the agents** — Planner and Collector — with
  the spend cap, never a button or a cron.
- **Server-side and indexed (D15).** No Sites table pages, filters, searches
  or counts in memory; every read is an index range or a search index.
- **Screen kit.** Read `docs/developer/screen-kit.md`; use `DataTable`,
  `PageHeader`, `StatusPill`, 15 rows per page, theme tokens only, English and
  Italian copy kept in step.
- **Share the admin logic, not the admin pages.** Where an admin site screen
  already works out a figure (`convex/websiteClientView.ts`,
  `convex/websiteSiteRows.ts`), move that logic somewhere both can call rather
  than writing it twice.

## Build log

**Phase 1 — built 2026-09-23 (night).** Checked in the browser against the
dev data (Ronins Agency, impersonated), 14 backend tests, lint, types and
guards green.

- Tables: `convex/siteSchema.ts` (latest rankings, pages, sections, day
  summaries, cited pages, content gaps, rebuild requests), kept current from
  the parser's writers through `convex/siteRankings.ts`, rebuilt by
  `convex/siteSummaries.ts` and `convex/siteContentGap.ts`, filled from what
  was already stored by `convex/siteBackfill.ts`.
- Queries: `sites.ts`, `siteKeywords.ts`, `siteCharts.ts`, `siteAi.ts`,
  `siteGoogle.ts`, `siteCompetitors.ts`, all through `siteAccess.ts`.
- Screens: `src/app/(dashboard)/app/sites/**` — the list, the site layout
  (record header, switcher, date range, side menu with key numbers and "Jump
  to a page"), and the sixteen pages whose data was stored.
- Downloads (D16): the kit's `ChartExportWrapper` gained opt-in PNG/SVG/CSV,
  themed background and an always-visible button; admin charts unchanged.

Clarifications made while building, so nobody re-decides them:

- **Bounded lists may be read whole.** A company's holds, a site's chosen
  searches and questions, its folders and its discovered competitors are
  capped on their records (a few hundred at most), so they are read whole by
  index and narrowed in place. The unbounded tables — keywords, pages, cited
  pages, the content gap, and in Phase 4 the link lists — are searched,
  filtered and paged on the server from indexes, as "Speed" says.
- **Weeks and months are bucketed from the day summaries at read time.** One
  row per site per day is the summary; a two-year chart reads at most 800 of
  them and folds them into weeks or months in the query. No separate week or
  month tables.
- **D17 on the AI pages.** A competitor asks nothing, so its AI figures come
  from the answers to the owned site's questions — this company's questions
  only; a mention in an answer to another client's question never reaches
  this company's screen.
- **Admin untouched (D13).** Two shared pieces moved out of admin files
  without changing any admin screen: the verdict validators
  (`convex/utils/trackingVerdicts.ts`) and the engine names
  (`src/ui/components/seo/engineLabel.ts`, re-exported by admin's
  `EngineChoice.tsx`).
- **Coordination.** A second session briefly built the first screens in
  parallel; its work was merged here and it stopped. One set of queries.

**Phase 2 — built 2026-09-23 (night).** Everything marked 🔧 is read out of
the answers we already buy, filed by day, and re-read from the stored answers
for free (`convex/siteBackfillRaw.ts`: `npx convex run
siteBackfillRaw:readStoredResults`, no model asked anything).

- Keywords: difficulty and its band, cost per click, twelve months of
  searches, traffic and its value, the results page's features, and the
  ranking page's page rank and links (`dataForSeoParsers.ts` →
  `siteKeywordRanks`, carried to `sitePageRanks` and `siteSections`).
- Day summaries: DataForSEO's own position bands and new / up / down / lost
  counts across everything the site ranks for, traffic value, spam score,
  broken pages.
- Google results pages kept per search, place and day (`siteSerpPages`,
  `siteSerp.ts`): page one, features, the domains an AI Overview or map pack
  names, "People also ask" and related searches.
- AI answer text, word for word (D9), in `aiAnswerTexts` beside `aiAnswers`
  (`siteAnswers.ts`) — beside, not on, because the answer rows are read many
  times to count and none of those reads should carry pages of text.
- Competitors' whole-domain keywords and traffic, for the Market map.
- Page type: the address settles the obvious pages for free; the rest are
  for the new `seo.page-type` Decision (`sitePageTypes.ts`), which ships off
  like every Decision — see Open questions.

**Phase 3 — built 2026-09-23 (night).** The nine 🔧 pages — Full answers, Who
ranks above you, Search features, Questions people ask, Position bands, New
and lost, Market map, Link quality, Where links come from — and the new
columns on All keywords (KD, CPC, traffic, trend, features; KD filter; sort
by traffic or CPC), Top pages (type, traffic and share, value, page rank,
linking websites; type filter; sort by traffic), Site structure (traffic) and
Organic competitors (their whole keywords and traffic).

**Phase 4 — built 2026-09-23 (night).** Six new calls
(`convex/dataForSeoLinkOperations.ts`): the backlinks list (one per linking
website), broken backlinks, referring domains, anchors, referring IPs, and
links gained and lost; each with its own cadence (`refresh`) so a list is
bought weekly or monthly whatever a cycle's cadence, a manual one included;
filed by `siteLinkFiling.ts`; six pages on them (`siteLinkLists.ts`). One
test call each on ronins.co.uk through the Collector, recorded in the cost
table:

| Call | Price per call | Cadence |
|---|---|---|
| Backlinks list (1,000 rows) | $0.043 | weekly |
| Broken backlinks | $0.024 | weekly |
| Referring domains (1,000 rows) | $0.043 | weekly |
| Links gained and lost | $0.037 | weekly |
| Anchors (1,000 rows) | $0.035 | monthly |
| Referring IPs (1,000 rows) | $0.037 | monthly |

About $0.72 a site a month with the site crawl below as first built (100
pages); about $0.86 with the crawl at 1,000 pages (2026-09-24). The two history calls
were withdrawn the same night — no backfilling (see "Collecting more").

**Phase 5 — built 2026-09-23 (night).** Paid search needs no new call: the
ranked-keywords answer already carries adverts beside organic results, so
they are filed apart (`sitePaid.ts`) — which also fixed an old bug, an
advertiser's adverts being read as organic rankings — and the paid figures
go into the day summaries. The site crawl is DataForSEO On-Page, monthly,
behind the Site audit page and the Overview's "Crawled pages"
(`dataForSeoCrawlOperations.ts`, `siteCrawl.ts`). Built at 100 pages ($0.015
a crawl); raised to 1,000 pages on 2026-09-24 (about $0.15), see Open
question 3. Three new pages: Site audit, Paid search, Paid keywords.

**Checks, 2026-09-23 (night).** Every page opened in Chrome against the dev
data for ronins.co.uk and a competitor; the full check (guards, lint, types,
every test: 576 files, 5,034 tests) green after the review below; the
production build passes; the 50,000-keyword load test
(`convex/sitesLoad.test.ts`) holds every query to well under half of one full
scan of the table, each timed as the fastest of a few runs so a busy machine
cannot fail it. The "Download all" buttons were not pressed in Chrome — that
saves files to the machine — so their server side was run against the dev
data instead (every table read correctly).

**Review, 2026-09-23 (late).** Three independent read-only reviews — tenancy
and safety, collection and filing, the screens — found no way for one company
to open another's site, and about twenty-five real faults, fixed the same
night:

- **D17, twice.** Pages cited by AI answers were counted across every
  company's questions, and a competitor's chart line counted mentions in any
  answer from any place. Cited pages are now kept per question, engine and
  place, and read for the site's own questions only (`citedPagesOf`);
  competitor mentions are worked out with the asking site's day summaries
  into `siteRivalAiDays`, per asking website and place. Tests prove another
  company's answers never reach the screen.
- **Money.** A 1,000-row link list could be paid for weekly and never filed
  (over the stored copy's ceiling): lists are now kept as compact tables,
  half the size, and one still too big keeps its strongest rows and files.
  A weekly or monthly call already on its way now holds its cadence (it was
  bought twice when the Collector hit its cap), and the agents'
  `request_website_data` tool now obeys each call's own cadence.
- **Places.** Ranking totals now record the place they were measured from,
  so a host watched from two places no longer mixes their totals or marks
  one place's rankings lost from the other's pull.
- **Older answers.** Re-filing an old pull can no longer bring back adverts
  a site has stopped, or thinner link counts; the ranked total counts
  organic searches only, not adverts.
- **Screens.** "Custom" dates can be chosen (`range=custom` in the address);
  the Sites list's search and type filter no longer leak into a site (a
  `type=OWNED` from the list crashed Top pages); every filter accepts only
  the values its page offers; search boxes no longer drop letters typed
  while the address catches up; filtered tables top up short pages;
  the Years view pairs months by calendar month; SVG downloads draw the
  chart (not an icon above it) with its legend; wins and losses has a
  search box; the servers list keeps its network while searching; whole
  lists page at fifteen rows; dates and numbers follow the reader's language.
- **Smaller.** CSV cells with a carriage return or a semicolon are quoted;
  page sizes are capped at 100; "What the AI searched" gives each question
  an even share of its read, most persistent first; the Sites list reads
  each owned site's answers once, not once per competitor.

One fault is left for a decision: see Open question 4.

More clarifications, made while building:

- **No page text, still.** A ranking page's title and a cited source's title
  are page text and are not kept; the page-type Decision reads the address
  and the top search instead. Searches (fan-out, "People also ask", related
  searches) and the AI answer text (D9) are the two kinds of text kept.
- **Anchors are kept for people.** A link's words are the point of the
  Anchors page; they are shown, never handed to a model.
- **DataForSEO refused `date_from`** on the backlinks time series ("Invalid
  Field", uncharged, 2026-09-23); without it the whole history since 2019
  comes back for the same price, so none is sent. Weeks are filed under
  their Monday.
- **Answers trimmed before storing.** A 1,000-row link list with every field
  is bigger than the raw copy a pull may keep, so the new calls' answers are
  trimmed to the fields we read first (`dataForSeoSlim.ts`).
- **Search and filters live in the address (D14)** on every table, and only
  the dates, step and "compare with" travel between pages.
- **Every table downloads as CSV:** the lists a page already holds straight
  away, and the big ones — keywords, pages, the content gap, cited pages, the
  link lists, paid keywords, full answers — built on the server from the
  table's own index and handed straight back to the button that asked
  (`siteExports.ts`). Never stored, so there is nothing to clean up; a file
  holds at most 50,000 rows, and a bigger table says so when it is cut.
- **Tables of days** (Position bands, New and lost, Link quality, New and lost
  links) are filtered by the date picker, not a search box: a date is not
  something to type.
- **A downloaded chart carries the site, the dates, the step and the
  platform's name** under its title, stamped on the file only. The name is
  the one set in System Settings, never written into the copy, so a clone
  that renames the platform gets its own.

## Storing everything (2026-09-24)

Anthony, on finding the screens thin: "I think we need to store whatever we
can please, then we can fully evaluate the screens to see what is useful and
what we keep. We also get an idea of costs etc which was kind of the purpose
of this exercise in the first place." Built the same day; nothing has been
collected with it yet — Anthony: "Until I am ready we are just building".

- **Limits, per company and per website** (`convex/companyDataLimits.ts`).
  How many keywords and how many backlinks are kept per website: 100, 250,
  500, 750, 1,000, 2,500, 5,000, 7,500 or 10,000 (the finer steps since
  2026-09-25; 100, 1,000, 2,000, 5,000 or 10,000 before), default 1,000. Set per company on its Data
  collection screen, and per website — owned or competitor — in a "Data
  limits for this website" section on the website's own page, where
  "Follow the company" keeps no setting of its own. Anthony: "I think we
  need to set a limit on the website not the just the company."
- **Every keyword** (`domain_ranked_keywords_list`,
  `convex/siteKeywordList.ts`): a thousand a request, the ones bringing most
  visits first, weekly, with the site's AI Overview, featured snippet and map
  pack appearances kept apart from its rankings (`siteKeywordFeatures`).
  $0.012 a request plus $0.00012 a keyword: about $0.13 a thousand.
- **Every link** (`backlinks_all`): every link rather than one per linking
  website, strongest linking websites first, weekly, with everything about a
  link but the linking page's words — rel values, where on the page it sits,
  the kind of site, its spam score and rank, repeats on the page, redirects,
  language, the sighting before last. Shown on All backlinks by a "Which
  links" choice, and downloadable whole. About $0.04 a thousand links.
- **Both lists come in pages** (`convex/sitePagedLists.ts`): a request per
  thousand rows, planned from the site's last count and completed from the
  first answer's; every page dated by the day its collection was planned, so
  a list is one list however many days its pages take.
- **Every page of the site audit** (`convex/siteCrawlDetail.ts`): which pages
  have each problem, and the broken links, free for thirty days after a
  crawl; the Site audit's rows open them.
- **Tracked searches to position 100.** Each check reads the first hundred
  results, not ten, so a site on page four has a position; "Not on page one"
  now reads "Not in the top 100". DataForSEO charges each ten results as a
  page, so a check costs up to $0.006 rather than $0.0006 — from their docs
  and pricing page, to be confirmed on the first charged check. All hundred
  results are kept with each results page; Who ranks above you still shows
  page one for a search the site is not in. A results page too big for the
  raw copy is cut to what is read rather than dropped.
- **The collection switch is obeyed at the last moment.** A call waiting in
  the queue for a company or website whose collection has since been switched
  off is dropped by the Collector before it is sent, and never paid for.
- **Still not kept: page text.** Titles, descriptions and body copy of other
  people's pages are left out, as before.

**Cost report — built 2026-09-24 as the Collection runs screens.** Korda's
first full run cost $7.85 at DataForSEO (149 requests) and $0.33 of AI.
Anthony: "it's really good intel and will help me a lot if I can view this
kind of report on the screen." Admin → company → Websites → Collection runs
lists every run for the client (a run is "when the agents run for a
company"): its requests, what was already held, DataForSEO and AI cost and
where it stands, with this month's spend, the last run, an estimate per month
and the next run above; a run costing a quarter more than the one before is
flagged. Each run opens in full: where the money went, what was bought and
how often it repeats, every website with its limits and price per 1,000
keywords, the AI judgements, what the client will cost from here, and the
Collector runs that sent it — every line against the run before. Worked out
in the background a minute after each request settles, and again after the
run closes (`convex/seoRunReports.ts`).

## Open questions

Added 2026-09-23 (night), for Anthony in the morning:

1. **"What kind of page is this?" — decided 2026-09-24: on.** Anthony: "Yes
   do it". Switched to Act for the whole platform (Admin → Decisions,
   `seo.page-type`), like the other four SEO Decisions, and run once over
   the five held sites: 38 pages labelled for $0.0013 of AI, so every
   ranking page on Top pages now has a type. From here each site's pages are
   labelled after its rankings are rebuilt.
2. **How much to keep — decided 2026-09-24: everything, up to a limit.**
   Anthony: "I think we need to store whatever we can please, then we can
   fully evaluate the screens to see what is useful and what we keep. We also
   get an idea of costs". Every keyword a site ranks for — AI Overview,
   featured snippet and map pack appearances included, filed apart — and
   every link to it are now kept, weekly, up to a limit chosen per company
   and per website; see "Storing everything" below.
3. **Site crawl depth — decided 2026-09-24: 1,000 pages a month per site.**
   ronins.co.uk's first crawl stopped at exactly 100 of its pages, so the
   audit covered only part of the site. The price goes with the pages
   crawled: about $0.15 a crawl at 1,000, against $0.015 at 100. Anthony
   agreed the recommendation. The next crawl of each site uses it; Admin's
   cost estimate shows the old price until then, because it is worked out
   from what the crawls have actually cost.
4. **What deleting a website removes — decided 2026-09-24: everything.**
   Anthony: "delete everything about the website". Built the same morning
   (`websitePurge.ts`): a question no other website asks goes with every
   answer to it — its words, citations, the searches the engines ran and the
   purchases behind them — and a search no other website tracks goes with
   every results page and purchase for it; the pages those answers cited are
   counted again without them, and the website's name is taken out of other
   answers' lists of who they named. A question or search another website
   still asks or tracks stays, because those answers are that website's too.
   Tested in `convex/websitePurge.test.ts`.

## Change log

- 2026-09-23 — Plan written from the owner's decisions D1–D5.
- 2026-09-23 — D6–D9 added: suggested rivals stay read-only, share of voice
  counts tracked rivals only, full bar and line charts designed for two years
  of data, and AI answer text is now stored and shown.
- 2026-09-23 — D10–D12 added from Ahrefs' Site Explorer: collect thoroughly
  (link lists and two-year history as new paid calls through the agents),
  Ahrefs-style charts, compare-two-dates and filters on every table; the
  Organic keywords and Top pages columns; Calendar, Site structure, Organic
  competitors, Content gap and the backlink list pages; five phases.
- 2026-09-23 — D13 added: admin is settings and data collection, the user
  front end displays, and the admin UI stays exactly as it is (the first
  wording, which retired the admin display tabs, was withdrawn the same day).
- 2026-09-23 — Tenancy rule spelled out: Sites are company-scoped and dynamic,
  the company comes from the caller never the URL, another company's site
  answers "not found", and every Sites query has a cross-company test.
- 2026-09-23 — D14 and D15 added: search and filters on every table, and a
  Speed section — server-side paging, an index for every sort and filter,
  search indexes, a latest snapshot per site, stored counts, page-load
  targets and a 50,000-keyword load test.
- 2026-09-23 — D16 added: every chart downloads as PNG, SVG or CSV in the
  theme the viewer has chosen, standing on its own with title, site and dates.
- 2026-09-23 — D17 added, replacing D2: every website the company holds, owned
  or competitor, is a Site on the list and opens the full set of pages; the
  rivals on a page are the company's other holds. The drawing ("Hakken Sites
  Drawing") was redrawn the same day with a site picker, so all 33 screens can
  be seen for any of the five websites.
- 2026-09-23 (night) — Phases 2 to 5 built, checked in the browser and by the
  full check; see the build log. The two history calls were withdrawn at
  Anthony's word — no backfilling in this plan — after one testing round had
  bought them once per site ($0.89). Three pages added in Phase 5 (Site audit,
  Paid search, Paid keywords). Open questions 1–3 added.
- 2026-09-23 (late) — Independent review of the build; about twenty-five
  faults fixed, two of them D17 breaches (cited pages and competitor
  mentions counted other companies' questions). Downloads now hand the file
  straight back rather than storing it. Open question 4 added.
- 2026-09-24 — Open questions decided: 1, the page-type Decision is on;
  3, the site crawl reads up to 1,000 pages a month per site, not 100; 4,
  deleting a website deletes everything about it, shared answers and results
  pages included unless another website still uses them. Question 2 is
  explained and waiting on Anthony.
- 2026-09-24 (afternoon) — Question 2 decided: store everything, up to a
  limit per company and per website. Built: the limits, every keyword, every
  link, the site audit's page-by-page detail, tracked searches to position
  100, and the collection switch obeyed before anything is sent. See
  "Storing everything"; not yet collected, at Anthony's word.
- 2026-09-24 (evening) — Korda's first full run ($7.85 + $0.33 AI); the
  Collection runs screens built from its report. The side menu's groups
  fold away — only Site, and the group of the page being read, start open —
  at Anthony's word: "there are too many options on the screen".
- 2026-09-25 — **Collect now**, at Anthony's word ("an override as a one off
  from the company schedule"): a button on a company's Collection schedule
  screen that tells the agents to run once for that company — a Planner run
  queuing everything for its websites and competitors, then a Collector run
  sending it, the Collector's spend cap applying (`seoAgentRuns.collectNow`).
  It starts the agents as their Run buttons do; no paid call goes round them,
  so "never a button" above still holds. The schedule is left as it is,
  nothing is queued twice, and it is refused while collection is switched off.
- 2026-09-25 — At Anthony's word ("set the timeout for 12 hours and yes fix
  the rest"): an answer that never comes is given up after twelve hours, not
  a day (`SEO_RESULT_TIMEOUT_MS`); and only a collection with requests still
  to send holds up a new one (`openSeoCycleOf`). One that has sent everything
  and only waits for answers no longer does — a single late site crawl had
  kept Korda's collection open, so Collect now would have queued nothing.
  The Planner follows the same rule.
- 2026-09-25 — Every collection run is a full run (Anthony: "each run should be
  a full run always"): the keyword and link lists and the site crawl are bought
  in every run, no longer held for a week or a month, and no earlier answer is
  reused. The Overview's headline shows the newest value held for each figure
  rather than a dash (it showed a dash for AI Overviews after a run that did
  not buy the keyword list).
- 2026-09-25 — Full runs reverted the same day (Anthony: "put it back to how it
  was with different collections … the data set always looks complete and we
  build on it with incremental"). Runs are incremental again — daily items
  every run, the keyword and link lists weekly, the crawl, anchors and
  referring IPs monthly — and every screen shows the newest data held for
  what a run did not collect.
- 2026-09-25 — Each call with its own cadence is bought on the run nearest
  that cadence, and every run by a company that collects about as seldom as
  the call (`collectsEveryRun`, `repeatDays`): a monthly company's run is the
  full scan; weekly and fortnightly runs buy the lists every run and the
  crawl, anchors and referring IPs every fourth and every other run; a daily
  one buys the lists weekly and the crawl monthly. Held for its whole cadence
  before, a weekly list — bought a few minutes short of seven days earlier —
  was bought every other week on a weekly schedule, and a monthly company
  skipped the crawl after every month of 30 days or fewer. Paged lists reuse a
  still-fresh page as single calls do, so a second press or a second company
  on the same day does not buy one twice.
- 2026-09-25 — The limit choices are 100, 250, 500, 750, 1,000, 2,500, 5,000,
  7,500 and 10,000 (Anthony), finer below a thousand for cutting a
  competitor's links down; 2,000 is no longer offered and nothing had it.
- 2026-09-25 — **Two agents, two agent schedules** (Anthony: "we have two
  agents already and all we need … is two agent schedules"). A company's
  Collection schedule is now a setting the Planner reads, never an alarm: its
  row names no agent and has no next run, so it no longer wakes the Collector
  for each company — which had sent a queue nothing had filled, because
  nothing woke the Planner. The Planner and the Collector each run on their own
  agent schedule (Admin → Workflows → Schedules); in Live mode a Planner run
  opens a collection only for a company with something due, and names the
  others in its summary. The companies' rows no longer appear on the Schedules
  list or on Health, and the company screen's "No collecting agent yet" box is
  gone. Korda's and Ronins' switch and cadence were kept as set
  (`2026-09-25-company-schedules-wake-nothing`).
