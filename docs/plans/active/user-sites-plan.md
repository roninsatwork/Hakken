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

**Show the data we collect first. Features go on top afterwards.**
Anthony, 2026-09-23: "we have to show the data we collect as the base layer
before we add more features on top."

So every page in this plan is fed by a DataForSEO call we already make and pay
for. No page is added for data we do not collect. Diagnosis, "what to fix",
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

## Where it lives

- A new **Sites** item in the user app sidebar
  (`src/ui/components/layout/SidebarNavigation.tsx`, next to Calls).
- `/app/sites` — the list of the company's own websites.
- `/app/sites/[siteId]/…` — one site, with the side menu below. `siteId` is
  the company's hold (`companyWebsites._id`), never the shared `websites._id`.
- The date range lives in the URL (`?from=YYYY-MM-DD&to=YYYY-MM-DD`, default
  last 30 days) so every page, link and refresh keeps it.

## The side menu — every page and where its data comes from

Status: **✅ stored** = the data is already read into our own tables, by day.
**🔧 in raw** = DataForSEO sends it and we keep the raw answer in
`seoDataPulls.resultJson`, but nothing reads it out yet. Nothing here needs a
new DataForSEO call.

### Overview

| Page | Shows | Source | Status |
|---|---|---|---|
| Overview | Headline numbers for the chosen dates, and what changed: AI mentions, top-3 and page-one counts, estimated traffic, backlinks, linking websites, domain rank | all five below; `seoWebsiteMetrics` (per day: `rankedKeywords`, `estimatedTraffic`, `top3`, `backlinks`, `referringDomains`, `rank`, `brokenBacklinks`) | ✅ stored |

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
| All keywords | Keyword, position, page, search volume, intent | `seoKeywordPositions` (`url`, `searchVolume`), `seoKeywordIntents` | ✅ stored |
| — extra columns | Cost per click, difficulty, monthly trend, SERP features | `keyword_data` | 🔧 in raw |
| Top pages | Each page: how many searches it ranks for, best position | `seoKeywordPositions.url` | ✅ stored |
| — traffic per page | Estimated traffic per page | `ranked_serp_element.serp_item.etv` | 🔧 in raw |
| Position bands | How many keywords are #1, 2–3, 4–10, 11–20 … | `metrics.organic.pos_*` | 🔧 in raw (`top3` ✅) |
| New and lost | New, up, down, lost keyword counts | `metrics.organic.is_new/is_up/is_down/is_lost` | 🔧 in raw |

### 4. Competitors — sites ranking for the same searches (`domain_competitors`)

| Page | Shows | Source | Status |
|---|---|---|---|
| Side by side | This site against each tracked rival: searches won, AI answers | `websiteSiteRows.loadRivalRows` | ✅ stored |
| Market map | Traffic and keyword count, this site against rivals | `full_domain_metrics` | 🔧 in raw |
| Suggested rivals | Sites we found, with what kind of site each is | `discoveredCompetitors`, `discoveredCompetitorDays` | ✅ stored — read-only (D6) |

### 5. Backlinks — links from other websites (`backlinks_summary`, `bulk_*`)

| Page | Shows | Source | Status |
|---|---|---|---|
| Summary | Domain rank, backlinks, linking websites, over time | `seoWebsiteMetrics` (`backlinks_summary`) | ✅ stored |
| Compared with rivals | Rank, backlinks and linking websites for the site and its rivals | `bulk_ranks`, `bulk_backlinks`, `bulk_referring_domains` | ✅ stored |
| Link quality | Spam score, broken backlinks, broken pages | `backlinks_spam_score`, `broken_*` | 🔧 in raw (`brokenBacklinks` ✅) |
| Where links come from | By country, domain ending (.com, .tv …), site type (blog, news, shop) | `referring_links_countries`, `_tld`, `_platform_types` | 🔧 in raw |

**Twenty-two pages: Overview plus five sub menus.** Thirteen are fed by data
already stored; nine need their data read out first (Phase 2), and two stored
pages gain extra columns from it.

## Charts (D8)

Bar and line charts, built with the chart library already in the app
(`recharts`, with `src/ui/components/charts/` — `chartPalette.ts`,
`ChartTooltip.tsx`, `ChartExportWrapper.tsx`). No second chart library.

**Design for two years of data from day one.** Only one day exists today
(2026-09-23), but every chart and query is built as if two years were stored:

- **Line charts for anything over time**: positions, AI mentions per engine,
  share of voice, estimated traffic, keyword counts, backlinks, linking
  websites, domain rank.
- **Bar charts for anything split into groups**: position bands, keywords by
  intent, mentions by engine, wins against losses, links by country, domain
  ending and site type, this site against each rival.
- **The dates pick the step.** Up to 90 days shows each day; up to a year shows
  weeks; longer shows months. A chart never draws hundreds of points.
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

### Phase 1 — the shell and the stored pages (about 40% of the plan)

1. `/app/sites` list: one row per held site — AI mentions, top-3 and
   page-one counts, what moved, last checked.
2. The site layout: title, the side menu (D4, D5), and a shared date range
   control (7 / 30 / 90 days and custom) that writes the URL.
3. Every page marked ✅ stored above, filtered by the date range.
4. Pages marked 🔧 appear in the menu, greyed, labelled "Coming soon". The
   menu stays one shape from day one, so nothing moves when they arrive.

### Phase 2 — read out what is in the raw answers (about 30%)

Store the AI answer text (D9) and write the chart summaries (D8). Extend the
parsers in `convex/seoCollectionParse.ts` and
`convex/dataForSeoParsers.ts` so every 🔧 field is written to our own tables,
**by day**, the same way `seoWebsiteMetrics` already is. Re-read the stored
results so existing days are filled in — free, no new DataForSEO call. Each
new table goes into `convex/seoTestDataReset.ts` and the website purge in
`convex/websitePurge.ts` in the same change (the `aiAnswers` miss, fixed
2026-09-23, is why).

### Phase 3 — the remaining pages (about 30%)

Turn each "Coming soon" item on once its data is stored, and add the charts
(D8) to every page that has a time series or a split.

## Rules for building these pages (drift guards)

- **The table above is the contract.** A page that is not in it is not built;
  a page that needs data not in it is a new decision, recorded here first.
- **Read-only (D1).** No add, remove, track or dismiss buttons on Sites.
- **Only this company's data.** Queries are `tenantQuery`
  (`convex/tenantFunctions.ts`) entered through the company's own hold,
  exactly as the admin site screens are (`convex/websiteSiteRows.ts`
  `requireSite`). Never start from a shared table and walk outward — that is
  what keeps one client's rivals off another client's screen. Admin
  `superAdminQuery` functions are not reused for the user side.
- **A page is about this site (D2).** Other businesses appear only as
  comparison beside it, never as a page of their own.
- **Every table shows when its data was checked**, in its own "Last checked"
  column (agreed 2026-09-23 for the admin Results tabs; the same applies here).
- **Screen kit.** Read `docs/developer/screen-kit.md`; use `DataTable`,
  `PageHeader`, `StatusPill`, 15 rows per page, theme tokens only, English and
  Italian copy kept in step.
- **Share the admin logic, not the admin pages.** Where an admin site screen
  already works out a figure (`convex/websiteClientView.ts`,
  `convex/websiteSiteRows.ts`), move that logic somewhere both can call rather
  than writing it twice.

## Open questions

None open. Q1–Q4 of the first draft were answered on 2026-09-23 as D6–D9.
Add new questions here, dated, before building the page they block.

## Change log

- 2026-09-23 — Plan written from the owner's decisions D1–D5.
- 2026-09-23 — D6–D9 added: suggested rivals stay read-only, share of voice
  counts tracked rivals only, full bar and line charts designed for two years
  of data, and AI answer text is now stored and shown.
