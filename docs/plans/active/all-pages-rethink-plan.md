# Google Analytics — All pages, rethought

**Started 2026-10-13. Status: built on dev the same day, every phase, and
checked on ronins.co.uk (§7).** The screen is
drawn on the canvas [Hakken — All pages, rethought](https://claude.ai/artifact/KeD9peY4FH9zAsk4TrZrCe)
(one board, a copy in [docs/plans/assets/all-pages-rethink/](../assets/all-pages-rethink/)).
Anthony, on the last round: "ok i think this is good can we make this a plan
and let me know the man days". Change a decision here, with a date, before
building anything that disagrees with it.

## Why

Anthony, 2026-10-13, after Heroes and attention was removed ("why do we need
this page at all? We already have all pages, we already have conversions"):

- "on the all pages screen we need to make this UX smarter. We need filters on
  the table: Gains, Dropped, Status Quo, No Visits"
- "move it away from money in the table and focus on the visits, views,
  conversion, Conversion Rate % and change up or down"
- On the first drawing: "the graphs are good but too deep … something similar
  to what Google Analytics does for all pages, a more letterbox graph and the
  table below … redraw the page so the table is nearer the top"
- "we need check boxes to select what goes on the graph like GA does too"

**What the screen does today.** Ronins, United Kingdom, last 30 days: 59 pages
viewed, a "Most viewed pages" bar chart, then a table of Views, People, Time,
"Conversions made here · £40" and the change in views. It shows no visits, no
conversion rate, nothing about pages nobody viewed, and no way to see which
pages gained or dropped without reading every row.

## 1. Decisions

- **AP1 — No money on this screen.** No £ in the table, the box or the
  download. Value stays on the Conversions screen and each page's own screen.
- **AP2 — The layout is Google Analytics' Pages and screens.** What Hakken
  sees, then one short, wide chart, then the table. Nothing below the table.
  Both bar charts drawn on 13 Oct were removed at Anthony's comments.
- **AP3 — The chart is "Views a day".** Your whole website as a dashed line,
  plus each page ticked in the table as a line of its own. **Five pages at
  most**, so the lines stay readable; the chart's own words say so. The five
  viewed most open ticked. Daily, weekly or monthly follows the screen's
  existing step choice.
- **AP4 — The table's columns, in order:** tick box, Page (title over
  address), Visits, Views, Views change, Dwell time, Conv., Conv. rate, Conv.
  change. People leaves the table; it stays in the download and on each page's
  own screen.
  - **Views change** and **Conv. change** are counts against the 30 days (or
    period) before: ▲ 59, ▼ 2. The views percentage shows on hover. A page
    with no views before reads "New"; a move of fewer than 3 views reads "The
    same"; no change in conversions is a dash.
  - **Conv.** is conversions made on the page (never a bare "conversions" in
    the hover text; see data-consistency). **Conv. rate** is those over the
    page's visits, greyed under 100 visits as today.
  - **Dwell time** is the engaged time a visit, as the Time column is now.
- **AP5 — Filters beside the search box:** All, Gains, Dropped, Static, No
  visits, each with its count of pages.
  - **Gains:** 3 views or more up on the period before (a new page counts
    from 0).
  - **Dropped:** 3 views or more down.
  - **Static:** fewer than 3 either way.
  - **No visits:** on the website (Sites → Your pages) but nobody viewed it in
    the period. These rows show with zeros.
  - The 3-view rule is written on the table, so nothing is hidden: a page
    going from 1 view to 2 is "up 100%" and means nothing.
- **AP6 — What Hakken sees, without money.** How many of the website's pages
  were viewed, gained, dropped, stayed static and had no visits; the page that
  dropped most and the conversions it still made; the page that gained most;
  the kind of page that moved most as a group. Do first: why the biggest drop
  fell (its searches in Search Console), the next step that works copied to a
  busy page that makes none, and the service pages nobody visited (the No
  visits filter). Ask Hakken reads the same box.

## 2. What it showed on ronins.co.uk (drawn from real figures, 13 Oct)

United Kingdom, last 30 days to 12 Oct 2026, read from the running app.

- 59 of 161 pages viewed: 33 gained, 6 dropped, 20 static, 103 no visits.
- /ai-agency/ dropped most, 177 views from 219, and still made 2 of the 7
  conversions. The home page gained most, 259 from 200, and made none (2 the
  month before).
- Content hub articles: 185 views from about 78.
- Every line on "Views a day" is real: the website from Overview (1,035
  views), each page from its own screen, each adding up to its row.

## 3. What Hakken already holds, and what is new

| Part | Held today? | How |
|---|---|---|
| Visits, views, dwell time, conversions made here, conversion rate per page | Yes | The page list (`analyticsListPage`) already returns them; the screen does not show visits or rate |
| Views change, conversions before | Yes | The list's change and `conversionsBefore` |
| The website's views a day | Yes | Overview's daily series |
| Pages with no visits | Yes | Sites → Your pages (`yourPagesList`), joined to the page list |
| Page kinds (Service, Content hub…) for the box | Yes | Your pages' groups |
| Each ticked page's views a day | **No** | A new ask of Google when the screen opens: date × page, for the ticked pages only (at most five), through the live-ask path a page's own screen uses (`googleAnalyticsLive.ts`) |

## 4. Phases and size

Estimates are man-days, as a developer would take.

| Phase | What it does | Man-days |
|---|---|---|
| 1 | **The table (AP1, AP4).** New columns and their sorting over the whole list (Visits, Views change, Conv. rate, Conv. change), Dwell time renamed, People and £ off the table, the short headings with full words on hover, the download to match, English and Italian. | 1.5 |
| 2 | **The filters (AP5).** Gains, Dropped, Static and No visits worked out on the server with their counts; No visits rows joined from Your pages so they page, sort and search with the rest; the rule written on the table; a tenancy test. | 2 |
| 3 | **"Views a day" and the tick boxes (AP2, AP3).** The website's line from what is held; the ticked pages' days asked of Google live, held until the next collection; the tick boxes kept in the address so a refresh keeps them; five at most; the "Most viewed pages" bar chart taken off. | 2.5 |
| 4 | **What Hakken sees (AP6),** rewritten without money, with Ask Hakken reading the same box and the one-voice checks. | 1.5 |
| 5 | **Proof.** The screen's look test against the drawing, the drift and rule tests, ronins.co.uk checked in Chrome against §2, and the full gate with GitHub's steps. | 1.5 |

**Total: about 9 man-days.** Phases 1, 2 and 4 use only what Hakken already
holds. Phase 3 is the only new ask of Google.

## 5. Risks

- **A slower first open.** The ticked pages' days are asked of Google when
  the screen opens: about a second. The website's line and the table show at
  once; the page lines fill in.
- **Thin pages.** Most of Ronins' pages have under 100 visits a month, so
  most conversion rates are greyed. That is the existing rule, kept.
- **No visits depends on Your pages.** A website whose sitemap has not been
  read shows no No visits filter until it has, and says so.

## 6. Questions — answered by Anthony, 2026-10-13

1. **Filters on views or on conversions?** "views". Gains, Dropped and Static
  go by views (AP5); the last column still shows the change in conversions.
2. **"All 162" or "All pages 162"?** "maybe just all": the first filter stays
  "All 162".
3. **People off the table** (still in the download and on each page's
  screen): "yes".
4. **The download without value (£)**: "yes".
5. **When built:** commit to dev, not pushed: "yes".

## 7. Built — 2026-10-13

### 7.1 Where it is

- **The rule:** `convex/utils/pageMoves.ts` (`moveOf`, `moveCounts`,
  `MOVE_VIEWS` = 3, `MOST_PLOTTED` = 5), tested in `pageMoves.test.ts`.
- **The list read whole:** `convex/googleAnalyticsPageMoves.ts`
  (`withQuietPages`) joins the pages viewed only before and Sites → Your
  pages (`yourPagePaths`) to the page list; `readAnalyticsList` takes the
  filter (`move`) and two new orders (`viewsChange`, `conversionsChange`);
  each row carries `viewsBefore`.
- **"Views a day":** the ticked pages are asked of Google in one ask
  (`askGoogleAnalyticsLive`, `plotted`), each held as `daily:<page number>`,
  and read by `analyticsPagesDaily`; the website's line is Overview's
  `analyticsChart`. The chart is `PagesDailyChart` (`AnalyticsChart.tsx`).
- **The table:** `AnalyticsListScreen.tsx` (the tick box, kept in the address
  as `plot`; the new columns and their cells in `AnalyticsCells.tsx`); the
  filters on the All pages screen, kept as `move`.
- **What Hakken sees:** `allPagesSees` (`convex/utils/sees/analytics.ts`);
  Ask Hakken's All pages answer has no money and each filter's count.
- **The look:** `docs/plans/assets/all-pages-rethink/look/AllPages.txt`,
  held by `googleAnalyticsLook.test.tsx`; the old All pages look is retired.

### 7.2 Built differently from the drawing

- **The views changes are real.** The drawing worked out each page's views
  before from the old Change column, which measured visits, not views. The
  screen reads each page's own views before, so its figures differ from the
  drawing's: /ai-agency/ is ▼ 102 (177 from 279), not ▼ 42.
- **No visits is every page nobody viewed in these dates,** however many
  views it had before; its Views change shows the fall (▼ 12). So the pages
  viewed and the pages with no visits always add up to every page, and the
  box's sentence agrees with the filters.
- **Dwell time is All pages' word only.** Landing pages and page groups keep
  their approved "Time" (question 6).
- **A page nobody viewed has no tick box:** it has nothing to draw.
- **What Hakken sees holds three sentences,** as every box does: pages
  viewed and with no visits; how many gained, dropped and stayed static; the
  page that dropped most and the conversions it still made, or else the page
  that gained most. The drawing's fourth thought — the kind of page that
  moved most as a group ("Content hub … 185 from 78") — and the page that
  gained most beside the drop are not in it (question 7).

### 7.3 What it showed on ronins.co.uk (United Kingdom, last 30 days to 12 Oct)

- All 162 · Gains 31 · Dropped 8 · Static 20 · No visits 103.
- "59 of your 162 pages were viewed in these dates; 103 had no visits. 31
  pages gained views, 8 dropped and 20 stayed about the same. /ai-agency/
  dropped most, 102 fewer views than before, yet made 2 of your 7
  conversions."
- Do first: see why /ai-agency/ dropped; copy its next step onto the home
  page; the pages nobody visited, /web-design-surrey/ and
  /app-developers-london/.
- Ticking /ai-consultancy/ asked Google for its days and drew its line; a
  sixth tick is refused with "Five pages at most on the chart".

### 7.4 Questions after building

6. **"Dwell time" on Landing pages too?** One name for one measure on every
  screen; it changes Landing pages' approved look, so it is asked.
7. **The box's group sentence** ("Content hub pages gained most as a group")
  in place of one of its three sentences — or left out?

## Change log

- 2026-10-13 — Drawn over five rounds of comments on the canvas, then this
  plan written when Anthony said it was good. About 9 man-days.
- 2026-10-13 — Anthony's answers (§6): filters on views, "All" kept, People
  and £ off the screen and its download, commit to dev when built.
- 2026-10-13 — Built (§7), every phase; checked on ronins.co.uk in Chrome.
