# Google Analytics — Landing pages, as a flow

**Started 2026-10-14. Status: drawn, agreed and approved to build; not
started — it begins once the other session has committed its Google
Analytics work (see "When it starts").** The screen is
drawn on the canvas [Landing pages as a funnel](https://claude.ai/artifact/2oBCEpaxfSNAtz3n7MFNbJ)
(one board; a copy and its picture in
[docs/plans/assets/landing-pages-flow/](../assets/landing-pages-flow/)).
Anthony, on the last round: "i think i am comfortable with this, please make
the repo plan and tell me the phases and man days". The build waits for his
"start". Change a decision here, with a date, before building anything that
disagrees with it.

**It follows the section's data standard**,
[ga-stored-figures-plan.md](./ga-stored-figures-plan.md) (Anthony,
2026-10-14: "normalise across all of the google analytics section to make it
more efficient"). These rules apply here:
- **SF1, SF15:** a screen never asks Google.
- **SF3, SF7:** every list is kept for each device and each home country.
- **SF10:** every store is on the keep list.
- **SF13, SF14:** a fact that can't be added up by day is one shared list per
  date range, keyed by page, holding each page's top 20 rows and the rest as
  one "other" row.
- **SF16:** every screen and Ask Hakken read the same rows.

## Why

Anthony, 2026-10-14, asking how Landing pages differs from All pages: "should
this page be a lot more like a funnel then". Then, over the drawing rounds:

- On a figure row and stacked bars: "i was expecting a funnel — not a bar
  chart style approach".
- Showing Universal Analytics' Behaviour Flow: "this is how google analytics
  does it". On the copy: "i think this is too close to GA … its lovely and i
  want it". Of the box version, after three other looks: "i think i prefer
  this graph but we need to add conversions and also highlight the route with
  a box clicked to make it easier to see the path". Also: "show conversions
  on the paths too".
- On the table under it: "is this a repeat of the chart — if so we need to
  come up with something [that] adds value to the page and [is] different".
  Then, of an advice table: "but this is a funnel to show what is happening —
  the insights section is there for the advice".

**What the screen does today.** What Hakken sees, a "Visits by landing page"
bar chart of the ten busiest, then a table of Visits, Bounce, Pages, Time,
"Conversions from visits" and Change. It shows where visits start, never where
they go next or where they leave.

## When it starts

Anthony, 2026-10-14, asked whether to start once the other session had
committed: "yes". In order:

1. **The stored-figures work is committed first.** The session building
   [ga-stored-figures-plan.md](./ga-stored-figures-plan.md) is changing the
   same files (the shared page lists, the list screen, the collection's ask),
   and its changes were not committed on 2026-10-14. Building alongside it
   would mean two sessions editing the same code. This plan starts from its
   commit.
2. **Phase 0 waits for ronins' allowance** to come back and checks it first
   (LF10). Its findings — whether conversions carry the page before, and
   whether `landingRoutes` is needed — are written here and told to Anthony
   before any code.
3. **Phases 1 to 5 follow in one sitting**, committed to `dev` and not
   pushed.
4. **Filling ronins' new lists** with a real collection run waits for
   Anthony's go, like every first fill.

## 1. Decisions

- **LF1 — The layout.** The site header and section menu as now; the freshness
  line; the page header (no divider); What Hakken sees; **"How visits moved
  through your website"** (LF2); the search box, Page group filter and
  Pages / Page groups switch; the table (LF4). The "Visits by landing page" bar
  chart goes. The page description: "Where each visit started, and what those
  visits did next: left, went on to another page, or converted."
- **LF2 — The flow chart (new screen-kit part, `PageFlowChart`).** Three
  columns, left to right: **Landing pages → Next page → Page after.**
  - **Five pages a column**, the busiest, then one "(n more pages)" box for
    the rest. Each page a box as tall as its visits (never under 30px, so its
    two lines fit), with an orange edge on its left; its address, then its
    visits and conversions ("96 · ● 4").
  - **Grey bands** join a page to the pages its visits opened next, as thick
    as those visits. A page's bands leave in the order of the pages they reach
    and arrive in the order they came from, so few cross.
  - **Visits that left there**: a red tail down the box's right edge, as long
    as those visits. Each column heading: "709 visits · ▼ 296 left · ● 3".
  - **Conversions**: an orange dot with a white ring on each route that led to
    a conversion, halfway along its band, bigger for more (3.5px plus 1.3px a
    conversion, up to three); a dot inside a landing page's box for the
    conversions made on that page itself. The key under the chart says both.
  - **Hover** any box, band or dot for its figures: "/ → /ai-agency/: 38
    visits, 2 conversions".
  - **Click a box to follow it**: the box takes an orange outline, its routes
    in and out turn orange, the pages at their other ends stay, everything
    else fades. Click it again, or another box, to change. A landing page's
    routes are followed through both steps (LF5). **The chart opens with no
    route followed**: every route grey (Anthony, 2026-10-14).
  - Not Google's look: no green boxes, no page icons, no "+ Step".
- **LF3 — The chart follows the screen's filters**: dates, country and
  device, as every chart here does. It always shows the whole website; the
  Page group filter and search narrow only the table.
- **LF4 — The table: each landing page's own funnel.** It shows what
  happened and gives no advice — advice belongs to Insights. Columns, in
  order:
  - **Page** — title over address, as now; "No page recorded" for (not set).
  - **Visits** — visits that started on the page.
  - **Left here** — visits that left the website from the page without
    opening another: "▼ 46 · 28.9%".
  - **Went on** — visits that opened another page: "113 · 71.1%".
  - **Most went to** — the page most of them opened next, and its share of
    them: "/ai-agency/ · 34%".
  - **Converted** — conversions from those visits, and their rate: "5 · 3.1%".
  Every heading sorts the whole list; rates from under 100 visits are greyed,
  as now. The Page groups view has the same columns. Bounce, Pages, Time and
  Change leave the table and stay in the download. 25 rows to start, with the
  25 / 50 / 75 / 100 choice, as built.
- **LF5 — Stored, never asked, and reused before anything is added.** The
  chart and the table read only what the collection run stored (SF1). They
  come from the shared page lists, kept for each date range, device and home
  country like the others (SF3, SF7, SF13), and nothing is asked of Google
  when the screen opens, for any device. Conversions on a route go onto the
  existing **page × the page before** list (`pageReferrer`), which a page's
  own screen already reads (SF16); no new list holds them. The routes inside
  each landing page's own visits are **one new shared list**,
  `landingRoutes`, only if phase 0 shows the existing next-page list
  (`pageNext`, every visit) misleads. If it is needed, the Next page column
  is exact for each landing page, and following a landing page lights its
  whole route. The Page after column counts the page opened after a next page
  in those same visits; a visit that goes back and forth counts each step it
  takes.
- **LF6 — What Hakken sees keeps today's rules** for Landing pages (the
  earners, the busiest page with no conversions, the visits with no landing
  page, the next step). Ask Hakken reads the same box.
- **LF7 — The look is locked** once built: the drawing is binding, the part
  joins the drawing kit and the screen kit's list, and a look test holds the
  screen's outline (§4, phase 5).
- **LF8 — Every page opens the page's own screen** (Anthony, 2026-10-14: "the
  click through on the table [should] go [to] the same detail page as the
  all pages detail … this should be the default to all page level click
  throughs in this section … that details page on all pages is really
  strong"). Every page in the Google Analytics section opens `all-pages/page`
  — never the landing page's own screen. That covers the table on Landing
  pages, Overview's pages, Conversions' landing pages, a channel's landing
  pages (its table and `ChannelParts`), and the links in What Hakken sees
  (`convex/utils/sees/analytics.ts`, `analyticsChannel.ts`). The flow chart's
  boxes keep their click for following routes (LF2); the box's hover says
  where to open the page. A guard test fails a page link in the section that
  goes anywhere else.
  - **The landing page's own screen retires.** `landing-pages/page` forwards
    to the page's screen, so old links still work. Its one part the page's
    screen lacks — the four stages joining Search Console to Analytics
    (Shown in Google, Clicked, Visits, Conversions) — goes with it: this
    section shows Analytics' own figures only.
- **LF9 — Back goes to the screen you came from** (Anthony: "the back button
  on the screen should take you back to the screen you came from"). A page's
  screen opened from Landing pages reads "Back to Landing pages" and returns
  there with its dates, device, country, filters, sort and page of the table
  as they were. The same from Overview, Conversions, a channel's page, an
  event's page, All pages, or another page's screen. Opened any other way
  (a shared link, Ask Hakken), it reads "Back to All pages", as now. The
  screen it came from rides in the page's address (`from`), so a refresh or
  a shared link keeps it. Only the section's own screens are accepted there,
  never an outside address.
- **LF10 — Google's allowance is respected** (Anthony, 2026-10-14, after
  another session used up ronins' allowance: "please also respect google
  quotas"). Google allows each website's Analytics 14,000 tokens an hour from
  Hakken, 40,000 an hour in all, 200,000 a day, and 10 asks at once.
  - **Every answer is read for what is left.** Each ask to Google asks for the
    allowance left (`returnPropertyQuota`). The collection stops asking for a
    website before it would fall under **a fifth of the hour's or the day's
    allowance**, and hands the rest of its run to the next hour, as a run
    already hands itself on.
  - **That check goes in the one shared ask** (`ask` in
    `googleAnalyticsCollect.ts`), so it guards every list in the section,
    not only this plan's.
  - **A refusal for quota is never retried in a loop.** The run stops, notes
    when the allowance comes back, and starts again then.
  - **Phase 0 is one read**, run only when the allowance left is checked
    first and is over that fifth. Its cost in tokens is written into this
    plan. It is not run while the allowance is used up.
  - **The cost of what this plan adds** — conversions on `pageReferrer`, and
    `landingRoutes` if needed — is measured in phase 0 and written here. A
    test on the fake Google fails a run that asks more than that.

## 2. What the drawing showed

ronins.co.uk, every country, last 90 days to 13 Oct 2026.

- **Real:** each landing page's visits, stayed visits and conversions — 709
  visits, 79 landing pages, 13 conversions worth £260; the 94 visits with no
  page recorded.
- **Made up for the drawing:** every route, the Next page and Page after
  columns, the conversions on routes, and Left here, Went on and Most went to
  past the first five rows. Hakken does not hold the routes yet (§3).

## 3. What Hakken already holds, and what is new

| Part | Held today? | How |
|---|---|---|
| Landing pages' visits, stayed visits, conversions and their value | Yes | The landing list (`landing`) |
| The pages seen in visits that started on a page, in no order | Yes | `landingPagesSeen` — not enough: it gives no order, so no step |
| A page's next pages over every visit | Yes | `pageNext` (`pagePath` × `pageReferrer`, top 20 a page) — used as it is if phase 0 finds it close enough for landing pages; it mixes in visits that started elsewhere |
| **Conversions on each route** | **No** | Each counted conversion added to the existing `pageReferrer` list, as `landingSource` carries them: one list, read by this chart and by a page's own screen (SF16) |
| **The routes within each landing page's visits** | **No — only if phase 0 needs it** | One new shared list, `landingRoutes`: `landingPage` × `pageReferrer` × `pagePath`, views. Same shape and same job as the others (`googleAnalyticsPageLists.ts`): the 7 and 30 days every run, the 90 days and 12 months weekly, each device, each home country, each landing page's top 20 routes and the rest as one "other" (`PAGE_TOP_ROWS`), on the keep list (SF10) |
| A landing page's Left here, Went on and Most went to | No | Worked out when read from the same rows as the chart, so the chart and table always agree: its first-step views, never more than its visits |

**Limits, said once:** five pages a column on the chart; the top 20 routes of
each landing page kept; a box never under 30px; a dot grows to three
conversions and no further.

**To prove first (phase 0):** that Google gives each conversion the page
before it (`pageReferrer` on key events, not only on page views), and how many
rows the routes return. On ronins.co.uk only (Anthony, 2026-10-14: "i just
want ronins").

## 4. Phases and size

Estimates are man-days, as a developer would take.

| Phase | What it does | Man-days |
|---|---|---|
| 0 | **Prove the data.** Only once ronins' allowance has come back and is checked first (LF10): one read of Google Analytics for ronins.co.uk, 90 days. It checks whether conversions carry the page before, and how far the existing next-page list (`pageNext`) differs from the routes inside each landing page's own visits; that decides whether `landingRoutes` is needed (LF5). It also measures row counts and first-step views against visits. Written into this plan before any code. | 0.5 |
| 1 | **Store the routes (LF5) within the allowance (LF10).** The allowance check in the shared ask, so the run stops above a fifth left and hands on to the next hour; the counted conversions added to `pageReferrer`; `landingRoutes` as a shared list if phase 0 needs it, asked in the same job as the other shared lists, for each device and home country, with the three addresses numbered as the website's pages and on the keep list; tests, including a run's cost on the fake Google; Convex functions deployed to dev. | 3 |
| 2 | **Read them.** One read for the chart (five a column, the rest, the bands, what left, the conversions on routes and on pages) and the table's new columns over the whole list, sorted, searched and by page group, for any device and home country, from the stores alone: nothing asked of Google (SF1). Ask Hakken reads the same rows. Held by the company's own Google Analytics only; a tenancy test. | 2 |
| 3 | **`PageFlowChart` (LF2).** The chart as a screen-kit part: boxes, bands, tails, dots, hover readouts, click to follow, reachable by keyboard and read as a table by a screen reader; its Download; added to the drawing kit and `screen-kit.md`; tests. | 2.5 |
| 4 | **The screen (LF1, LF3, LF4, LF6).** Landing pages with the chart in place of the bar chart, the new columns and cells, the Page groups view, the download, English and Italian, empty and loading states. | 1.5 |
| 4b | **Page click-throughs and back (LF8, LF9).** Every page link in the section to the page's own screen, with the screen it came from in its address; the back link named and returning there as it was; `landing-pages/page` forwarding; What Hakken sees' links; English and Italian; the guard test. | 1.5 |
| 5 | **Proof (LF7).** The screen's look test against the drawing, the chart's drift tests, ronins.co.uk checked in Chrome, and the full gate with GitHub's steps. | 1.5 |

**Total: about 12.5 man-days.** Phase 0 is a read of Google Analytics and costs
nothing. Phase 1 adds conversions to an existing list, and at most one new
shared list, both collected in the run's existing job.

## 5. Risks

- **Conversions may not carry the page before.** If phase 0 shows Google
  leaves `pageReferrer` empty on key events, the dots move from routes to the
  page they were made on (still on the chart, one step less precise). Said
  here before any code.
- **Big websites, many routes.** A site with thousands of landing pages
  returns many rows. Phase 0 measures ronins only, so a big website's count
  is first seen when it is collected. Keeping each landing page's top 20
  bounds what is held either way.
- **Red beside orange.** The "left" tails are red and the followed routes
  orange. Each also differs by place (a tail hangs on a box's edge) and the
  ▼ words, so the colour is never the only sign.
- **Back-and-forth visits.** A visit that returns to its landing page and
  leaves again counts both steps; Went on is held to the page's visits so it
  never reads over 100%.

## 6. Questions for Anthony

1. **When the screen opens:** answered — "It opens with no route
   selected" (LF2).
2. **Phase 0's websites:** answered — "i just want ronins".

## Change log

- 2026-10-14 — Approved to build (Anthony: "yes"), starting once the
  stored-figures session has committed its Google Analytics work ("When it
  starts").

- 2026-10-14 — LF10 added (Anthony, after another session used up ronins'
  allowance): every ask reads what is left; the run stops above a fifth and
  hands on to the next hour; no retry loops; phase 0 waits for the allowance.
  Phase 1 is now 3 days; about 12.5 man-days in all.

- 2026-10-14 — LF8 and LF9 added (Anthony): every page in the section opens
  the page's own screen; the landing page's own screen retires and forwards;
  back returns to the screen you came from. Phase 4b, 1.5 days; about 11.5
  man-days in all.

- 2026-10-14 — The chart opens with no route followed; the drawing redrawn
  so (Anthony).
- 2026-10-14 — Phase 0 on ronins.co.uk only (Anthony).

- 2026-10-14 — Brought into line with the section's data standard
  (ga-stored-figures-plan.md SF1, SF3, SF7, SF10, SF13–SF16). The screen
  never asks Google for one device, as the first version said. Conversions
  go on the existing `pageReferrer` list. `landingRoutes` is added only if
  phase 0 shows `pageNext` misleads. Still about 10 man-days.

- 2026-10-14 — Drawn over eight rounds on the canvas (funnel, figure row,
  classic funnel, Google's Behaviour Flow, three looks, the box flow with
  conversions and click to follow, an advice table, then each landing page's
  own funnel). Plan written when Anthony said he was comfortable with it.
  About 10 man-days.
