# Sites — what a client sees for each website they track

**Started 2026-09-23. Status: planned, nothing built.** Owner decisions are
recorded below; change them here, with a date, before building anything that
disagrees with them.

This is the user front end for Hakken's SEO data: a client opens **Sites**,
picks one of their websites and reads everything we collect about it, the way
they would in Semrush or Ahrefs. It is written to be built by someone — or
some model — with no other context. Follow `AGENTS.md`. Anchors carry the file
they rest on; verify them before editing, because files move.

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
| D2 | Can a client open a competitor as if it were their own site? | **No.** Competitors are only ever shown beside the client's own site. |
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

## Where it lives

- A new **Sites** item in the user app sidebar
  (`src/ui/components/layout/SidebarNavigation.tsx`, next to Calls).
- `/app/sites` — the list of the company's own websites.
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
| What the AI searched | The searches the engines ran behind the scenes | `promptFanOutQueries`, `promptFanOutDays` | ✅ stored |

### 2. Google results — page one for each tracked search (`serp_google_organic`)

| Page | Shows | Source | Status |
|---|---|---|---|
| Your searches | Each tracked search: position, trend, last checked | `seoKeywordPositions`, `websiteSearchStats` | ✅ stored |
| Wins and losses | Searches that moved up or down in the dates chosen | `websiteMoves` | ✅ stored |
| Who ranks above you | The full page one for each tracked search | SERP `items` | 🔧 in raw |
| Search features | Where Google shows an AI Overview, map pack, featured snippet, "People also ask" | SERP `item_types` | 🔧 in raw |
| Questions people ask | "People also ask" and related searches | SERP `people_also_ask`, `related_searches` | 🔧 in raw |

### 3. Organic keywords — everything the site ranks for (`domain_ranked_keywords`)

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
💷 wait for Phase 4; the rest are built from data we already buy.

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
| Backlink history (`/v3/backlinks/timeseries_summary/live`) | Two years of backlink and linking-website history, at once | **once per site**, then our own collection continues it |
| Ranking history (`/v3/dataforseo_labs/google/historical_rank_overview/live`) | Two years of monthly traffic, keyword counts and position bands, at once | **once per site**, then our own collection continues it |

The two history calls mean the two-year charts (D8) have real data on day
one instead of filling in over two years.

**How the new calls are run — the same rules as every call today:**

- Planned by the Planner agent and sent by the Collector agent, never by a
  button or a cron (`docs/plans/active/websites-and-competitors-plan.md`;
  `convex/seoAgentRuns.ts`). Their cost shows in the agent's run, logs and
  Observability.
- The Collector's spend cap per run (`agents.maxCostUsd`) applies to them.
- **One test call first** for each new call, on one site, to record its real
  price in the running cost table before it is switched on for everyone.
- **Row caps.** Lists can be huge (ronins.co.uk shows about 34,000 backlinks,
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
  (at once, with the history calls).
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
- **Every chart can be exported** through `ChartExportWrapper`, and has a
  plain table view underneath for anyone who wants the numbers.
- **Colours from `chartPalette.ts` only** — no hardcoded colours
  (`src/theme-drift.test.ts`).
- **Not enough data yet** is said in words ("Charts fill in as more checks
  run"), never shown as a flat line that looks like no change.

## Tables (D12)

- **Compare two dates.** Every table has a "this date vs that date" picker, like
  Ahrefs ("23 Sep 2026 vs 23 Aug 2026"). Rows show the change between them,
  and New and Lost where a row exists on only one side.
- **Filters** on the keyword and page tables for every column we hold; a
  filter for a column we do not hold is not shown.
- **Last checked** in its own column on every table.
- 15 rows per page, `DataTable` from the screen kit, export to CSV.

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

1. `/app/sites` list: one row per held site — AI mentions, top-3 and
   page-one counts, what moved, last checked.
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
Collector; one test call each to record the price; run the two history calls
once per site; then turn the 💷 pages on.

### Phase 5 — more we can buy (about 10%)

Paid search estimates and the site crawl, each only after its own price test
and go.

## Rules for building these pages (drift guards)

- **The tables above are the contract.** A page or column that is not in them
  is not built; one that needs data not in them is a new decision, recorded
  here first.
- **Read-only (D1).** No add, remove, track or dismiss buttons on Sites.
- **Only this company's data.** Queries are `tenantQuery`
  (`convex/tenantFunctions.ts`) entered through the company's own hold,
  exactly as the admin site screens are (`convex/websiteSiteRows.ts`
  `requireSite`). Never start from a shared table and walk outward — that is
  what keeps one client's rivals off another client's screen. Admin
  `superAdminQuery` functions are not reused for the user side.
- **A page is about this site (D2).** Other businesses appear only as
  comparison beside it, never as a page of their own.
- **The admin UI stays as it is (D13).** No admin screen is added, changed or
  removed by this plan.
- **Every paid call goes through the agents** — Planner and Collector — with
  the spend cap, never a button or a cron.
- **Screen kit.** Read `docs/developer/screen-kit.md`; use `DataTable`,
  `PageHeader`, `StatusPill`, 15 rows per page, theme tokens only, English and
  Italian copy kept in step.
- **Share the admin logic, not the admin pages.** Where an admin site screen
  already works out a figure (`convex/websiteClientView.ts`,
  `convex/websiteSiteRows.ts`), move that logic somewhere both can call rather
  than writing it twice.

## Open questions

None open. Add new questions here, dated, before building the page they block.

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
