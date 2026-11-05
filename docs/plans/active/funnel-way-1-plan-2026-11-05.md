# Plan: Funnel as Way 1, with the eye and Ask Hakken

**Written 2026-11-05 after Anthony picked Way 1: "ok i thnk this page is good, i want way 1". His answers to the open
questions are below. Not built. It waits for his go.**

The drawing is board "Way 1" on the canvas "Hakken — Funnel, three ways"
(https://claude.ai/artifact/HBwsF2VW8ghxWrBwpvZfmR), on More Handles' real figures for October 2026. A copy is saved under
`docs/plans/assets/funnel-way-1/` and is the look built to.

This replaces the look agreed on 14 October in `landing-pages-flow-plan.md`. That plan stays as the record.

**The eye and Ask Hakken are part of this page, not an extra.** The page isn't done until Ask Hakken answers the page's own
questions correctly, on the page's own figures (steps 7 and 8).

## How long

**About 19 days for a developer. As agent work, about 6 days.**

| Step | What | Days |
|---|---|---|
| 1 | Save the routes and groups Way 1 needs | 3½ |
| 2 | Read them, on every date | 2 |
| 3 | The route chart part | 3½ |
| 4 | The steps chart, as a standard part | 1 |
| 5 | The four boxes and the daily chart | 1½ |
| 6 | The table and its tick boxes | 2 |
| 7 | What Hakken sees on this page | 2 |
| 8 | Ask Hakken on this page | 2 |
| 9 | Checking it all | 1½ |
| | **Total** | **19** |

## What the page shows, top to bottom

1. **The header.** Funnel, with "Where people arrive on your website, and what they do next."
2. **Four boxes.**
3. **People who left straight away, each day** (Anthony: "can we make this the first component", "under the hero boxes").
4. **Where people went next.** The route chart, five pages deep and ten pages down, with every other page in its group.
5. **The search row and the table,** with tick boxes that choose what the route chart shows.

## Step 1. Save the routes and groups Way 1 needs

**Today.** Hakken asks Google for each step visitors took, then keeps the five busiest pages in each of three columns. It
throws the rest away. That caused three faults on today's chart.
- It draws 5,560 of the 15,227 visits that went on to a second page.
- It disagrees with the table. The Home page shows 3,985 visits and 26 conversions on the chart, and 4,049 and 4,264 in the table.
- It can't show a page outside its five.

**The fix**
- **Five columns and ten pages a column** in the saved chart (`buildFlow`, `flowChart`, `FLOW_NODES` in `convex/utils/landingFlow.ts`).
- **Every first-page box takes the table's figures,** so the chart and the table always agree.
- **Every visit that went on is on the chart.** Those whose route was let go join the group of the page they reached.
- **Every other page is in its Classification, in every column** (Anthony, "Should the Others box split into groups?": "yes"). The
  eight biggest groups show by name, and the rest show together as "6 other groups". Search and basket pages are one group of their own.
- **One new saved list, `landingRoutes`.** Each landing page keeps its 20 busiest next pages, the same shape as the other
  page lists. This is what makes ticking any page possible.
- **Nothing more is asked of Google.** All of this comes from the answers Hakken already asks for. It's only saved, not
  asked for again.
- **Find out why the Home page's Left is wrong.** The table says 1.6% left it, and Google says 16.6% left straight away. I
  think a reload counts as going on, but I haven't proved that. A page's Left must never be lower than what Google says left straight away.

**When the figures appear.** Once this step is built, I run one collection each on More Handles and Ronins, so the rest can be
checked on real figures (Anthony: "yes"). I read the allowance left first and keep a fifth of it in hand. Other websites fill on
their night's run: this week and this month the next night, and longer dates within the week. Until a date has filled, the chart
says it's still being collected.

## Step 2. Read them, on every date

- **The route chart** reads the saved chart, plus one small read of the ticked pages' routes.
- **The daily chart** needs September's engaged visits. `readPeriodBeforeChart` holds them and doesn't hand them over yet.
- **The table** learns to leave out search, basket and account pages (`leaveOut`, which only All pages has today).
- **Every read is run on all seven dates** on More Handles, including a year of a long list, which can run a read out of its
  64MB (`eachSlotRow`).

## Step 3. The route chart part

`PageFlowChart` stays one standard part. Conversions uses it too, so its three columns and its big boxes stay as they are.

- **Any number of columns,** and a `compact` option: one line a page, with the name on the left and the number on the right, as drawn.
- **A real hover,** the kit's panel following the mouse, as on All pages' map. It replaces the browser's tooltip. Conversions'
  route chart gets it too (Anthony: "yes").
- **Rollover.** On a page, it gets an outline and its routes light up, carrying on through the later columns. The rest
  step back. A route or an orange dot lights itself and the two pages it joins.
- **One scale for every box,** so nothing is drawn smaller than it is. It replaces the big Others box. A group has a grey edge, and the key says so.
- **A group's box resizes** as pages are ticked and unticked, because it holds the pages not ticked.
- **Plain page names** with the web address in the hover: Basket, Checkout, Order complete, Search results, Your account.
  One short list a shop platform, next to `shopPages.ts`. Any other page takes its name from its address.
- **Same address, same box.** Two addresses that mean the same thing to a person become one box, as Search results does.
- **The orange dots stay on the routes.** On compact, the dot inside a page's box goes, and its conversions are in the hover and the table.
- It goes in the drawing kit and `screen-kit.md`.

## Step 4. The steps chart, as a standard part

Anthony, on Way 2: "this is good as a standard shared component but its way too deep and take up too much space". So it's
built short, with its tallest box at 120 pixels, and with the same rollover and hover. Any page can use it. **No page uses it yet,**
as Way 1 doesn't have it. It goes in the drawing kit and `screen-kit.md`.

## Step 5. The four boxes and the daily chart

| Box | October on More Handles | Line under it |
|---|---|---|
| Visits | 35,739 | 4.7% fewer than September |
| Left straight away | 37.5% | It was 34.0% in September. |
| Pages a visit | 4.3 | 4.5 in September |
| Conversions | 27,273 | 4.7% fewer than September |

**The daily chart** is the standard chart with menus (`ChartExplorer`), as on Visits.
- **Show:** Left straight away, Stayed and looked around, or Conversions.
- **Compare with:** September, or No comparison.
- **Hover:** the standard table, with a line down the day and a dot on each line.
- It follows the page's Daily, Weekly or Monthly menu.

## Step 6. The table and its tick boxes

- **Columns:** tick, Page, Visits, Left, Stayed, Most went to, Conversions with "per 100 visits" under it. Each figure is above its share, so the table fits the page.
- **Headings' hovers** say what Left and Stayed mean.
- **Most went to** uses the plain page names.
- **The search row:** Find a page and Classification (All but search and basket). The table is pages only, with no Show menu (Anthony: "teh table is pages only").
- **The bar** says the number of pages and has Download CSV, with no sentence beside it, as on All pages.
- **The tick boxes** are All pages' own. A page ticked joins the First page column, and a page unticked goes back into its group.
- **It opens with the first ten pages ticked.** Ten is the most. After that the rest grey out, with a hover saying why.
- **Ticks stay in the address,** so they survive a refresh, a new page of the table or a shared link.
- **The chart follows the table's Classification menu.**

## Step 7. What Hakken sees on this page

- **New findings, each compared with something, worked out for whatever dates are chosen.** The rules rank what's biggest, and
  a bar only keeps out what's too small to trust. On More Handles for October, they should find things like these.
  - Left straight away against September: 37.5% and 34.0%.
  - The busy pages people leave, by name. The tubular latch guide lost 405 of its 440 visits.
  - What those pages have in common. Six of the eight that lost most are blog guides.
  - The classification people leave most, against the whole website. Blog against about 6 in 10.
  - Where a shop's visitors stop. Of the 779 visits that reached the basket second, 475 went on to checkout.
  - Visits with no page known: 2,191, about 1 in 16. These need Tracking health.
- **The screen list** gets this page's parts, top to bottom, and what it never talks about: money, and conversions as if they were visits. It also says the two meanings of left.
- **Every chart hands over all its figures,** for all five columns and every ticked page.
- **Links for "Do first" steps:** a page's own screen, Tracking health, All pages and Conversions.
- **The panel** has Anthony's three parts: figures, what it means, then the chat.
- **Tested on every date the menu offers,** with a rebuilt fixture. Each date finds the headline and at least four things.
- **One real press,** read in full, words and run log, with the cost said first (about 12p to 18p).

## Step 8. Ask Hakken on this page

- **`read_google_analytics` for this page** gives what the page shows.
  - The four boxes.
  - The chart's five columns.
  - Any page's routes, by its address.
  - The order a question needs: most people lost, most stayed, most conversions.
  - One classification with its totals.
- **It leaves out search, basket and account pages,** says so, and can read them when asked.
- **It explains the two meanings of left,** and warns first on dates that cross the tracking fault in early September.
- **It says rough or real.** The figures are real once step 1 has filled.
- **It can redraw any chart on the page** as bars, a pie or a line (`redraw_page_chart`), from the figures each download holds.
- **A free test that stays in the code.** For all seven dates, Ask Hakken's figures must equal the screen's.

**Real questions, about 30p at most in all (Anthony's OK given, 5 November).** On More Handles for October.
1. "How many people left straight away, against September?" 37.5% and 34.0%.
2. "Which busy pages lose the most people?" The tubular latch guide first, 405 of 440.
3. "Where do people go after the basket?" Checkout, 475 of the 779 that reached the basket second.
4. "How did the Blog do?" 2,088 visits, 232 stayed.
5. "What does Page not known mean?" 2,191 visits with no page recorded, with a link to Tracking health.
6. "Why do some pages show over 100 conversions per 100 visits?" It must say it counts times, not visits.
7. "Show where the Home page's visitors went as bars."
8. "Show people leaving each day as bars."
9. On Last 3 months: "Did more people leave straight away?" It must warn first.

These figures are from today's saved data. Anything step 1 changes gets its new figure here before the questions are asked.

Figures once step 1 had filled: the tubular latch guide lost 406 of 440. Basket to checkout is 349 of 763, as the chart fits it (Google's own step, at any depth, is about 475). The Blog had 2,088 visits and 162 stayed. Page not known is 2,191.

## Step 9. Checking it all

- Tests for the new saved lists, the reads, the tick boxes, the plain names and both chart parts.
- A new look test for the approved board. Today's look test and its outline retire.
- Every read run on all seven dates on More Handles, timed before and after. Then the list read on Ronins, Korda, NEC and
  Hurtwood House, so it works with 60 pages as well as 5,000.
- A test that counts Google's asks, so a run asks no more than it does today.
- Checked in Anthony's Chrome against his comments, not against this plan.
- `npm run check` once at the end, then GitHub's own steps in a copy, so the app on port 3000 keeps running. English and Italian kept level.
- **Committed to `dev` once these pass, and not pushed** (Anthony: "yes"). Only this work's files go in the commit.

## Limits, said now

- **Five columns.** Google gives one step at a time, not whole journeys. Hakken joins the steps up, so each column further
  is a little less exact. A visit that goes back and forth counts each step.
- **Ten pages a column, and ten ticks.** More pages only add small ones on a shop this size. 10 pages cover 27% of visits, 20
  cover 31% and 50 cover 38%. The groups hold the rest.
- **Eight groups by name.** The rest show together. On More Handles that's six small ones.
- **The chart is taller.** With ten pages and up to nine groups a column, it's about 740 pixels on More Handles.
- **A page keeps the routes that reach the chart's boxes** (`landingRoutes`). The rest of its visits join their groups.
- **Figures from the third page on are close, not exact.** So are a group's in the second column. Google can't say how far into a visit a step came, so they're fitted to the visits that could have reached them. A page named in the first two columns has Google's own figure. A route between two named pages there is Google's own, never more than went on from the first.
- **Orange dots only on the top five routes between two columns.** On a shop nearly every route has a conversion, and a dot on each hid the chart.
- **Select top 10 takes the first ten rows of the page of the table in view,** in the order it's sorted. On page 2 of the table, that's page 2's top ten.
- **Ticks only change the first column.** The columns after it always show the whole website, as a page's own routes are only saved as far as the second page. Following ticks all five pages deep would mean saving every page's whole journey.
- **The September line** on the daily chart only shows on dates held day by day: weeks and months, as on Visits.
- **Conversions count times, not visits,** as everywhere in this section. That's why it says "per 100 visits".
- **Plain names** cover four shop platforms. Any other page takes its name from its address.
- **Saved data grows** by one list a date, device and home country (`landingRoutes`). Measured on a year of More Handles: 15,113 route rows in 8 parts, beside 1,255 flow rows and 11,766 onward rows.

## Anthony's answers, 5 November

1. **Should the Others box split into groups?** "yes". This went against my "not yet". It's drawn on Way 1 and counted in steps 1 and 3.
2. **What should the tick boxes do when the table shows Classifications?** "teh table is pages only". The Show menu has gone.
3. **Should Conversions' route chart get the new hovers?** "yes". Found while building: no page has drawn that chart since 30 October (`ConversionFlowCard`), so there's nothing on screen to change. The part it would use has them.
4. **Keep both figures for leaving?** "yes". Left straight away (37.5%) is people who stayed under 10 seconds and did nothing. Left in the table (about 6 in 10) is people who saw one page, however long they stayed. The heading's hover says which is which.
5. **Fill and check it straight away?** "yes". One collection each on More Handles and Ronins, about 50p of real questions and presses, and a commit to `dev` once the checks pass, not pushed.

## For the builder: where things live

- **The page:** `src/app/(dashboard)/app/analytics/[siteId]/funnel/page.tsx`. **The chart card:** `_components/LandingFlow.tsx`.
- **The table:** `_components/AnalyticsListScreen.tsx` (`COLUMNS.landing`, `usePlotted`, `columnOf`) and `_components/AnalyticsCells.tsx` (`ShareCell`, `NextPageCell`, `ConversionsHereCell`).
- **All pages to copy from:** `all-pages/page.tsx`, `_components/AllPagesParts.tsx`, `docs/plans/active/all-pages-way-6-plan-2026-11-04.md`.
- **The daily chart to copy from:** `VisitsLineCard` in `_components/VisitsCharts.tsx`.
- **What's saved:** `convex/utils/landingFlow.ts`, `convex/googleAnalyticsPageLists.ts` (`flowOf`, `FlowSteps`, `DROPPED_ROUTES`), `convex/googleAnalyticsLists.ts`, `convex/googleAnalyticsSchema.ts`.
- **The reads:** `convex/googleAnalyticsFlowReads.ts`, `convex/googleAnalyticsReads.ts` (`shopSplit`), `convex/googleAnalyticsChartReads.ts` (`readPeriodBeforeChart`), `readPageRows`.
- **The parts:** `src/ui/components/screens/PageFlowChart.tsx` (Conversions uses it in `_components/ConversionParts.tsx`), `src/ui/components/charts/ChartTooltip.tsx`, `SiteTreemap.tsx`'s hover to copy, `scripts/drawing-kit/parts.tsx`.
- **The eye:** `convex/utils/sees/own/googleAnalytics.ts` (`funnelFindings`), `screenEntries/googleAnalytics.ts` (`googleAnalytics.landing`), `googleAnalyticsPeriods.test.ts`, the fixture `src/test/fixtures/moreHandlesFunnel.json`. Read `docs/developer/what-hakken-sees-guide.md` first.
- **Ask Hakken:** `convex/assistantAnalyticsReads.ts` (`LISTS`), `convex/toolConnectorDefinitions.ts`, `convex/utils/assistantPageCharts.ts`.
- **Tests that will change:** `googleAnalyticsLook.test.tsx`, `docs/plans/assets/landing-pages-flow/look/LandingPages.txt`, `PageFlowChart.test.tsx`, `src/pagination-drift.test.ts`, `src/translation-parity-drift.test.ts`, `src/seen-words-drift.test.ts` (run `node scripts/seen-words.mjs`).

## Progress

- 2026-11-05: three ways drawn. Way 1 made with Anthony by comment: five pages deep, ten down, smaller, new hovers, tick boxes, and the daily chart first. He picked it. This plan written. Then his five answers: Others split into groups and the Show menu gone, both drawn on Way 1. Nothing built. Overall: about 30%.
- 2026-11-05, build: steps 1 to 6 built and checked in Chrome. Anthony asked mid-build for a Clear all and a Select top 10 as a standard table part: `TableTicks.tsx` (`tickColumn`, `TickCount`, `TickActions`), on Funnel and All pages. He then asked for a better look and for clearing to mean something; three ways were drawn on the canvas (board Ticks) and he picked Way 3, two proper buttons beside Download with "10 of 10 on the chart" in the bar. With nothing ticked, the chart is a message and a Select top 10 button. Step 7: own findings for every date, one press read in full ($0.094, about 7p, one rewrite). Step 8: three reads (`landingPages`, parts `boxes` and `chart`), a free test against the screen, and a page's routes on a redrawn chart (`only`).
- 2026-11-05, a year of More Handles: the fill failed many times before it was right, and I named the wrong cause more than once before I had the evidence. What the runs and temporary timing notes showed: each page of Google's route answer took about 14 seconds, as nine figures a row were asked and this list reads one. Rows from other websites were kept one by one, and "who went on" was held as whole rows, so a run could also pass 512 MB ("Node.js action execution ran out of memory"). A slow search in the flow's own working-out cost another 10 seconds. Now: only the visits are asked for the routes, arrivals are one row (152,000 kept routes became 39,000 in the biggest group), who went on is held as a number each, a flow's list has half a list's room, the steps are let go once copied, and a group's two asks go side by side, one group at a time. The year now takes 435 seconds, with 68 asks and about 1,400 of Google's tokens, and holds about 260 MB at most. A long date's route job starts in a step of its own, so a late start can't run it past an action's limit. Korda, NEC and Hurtwood House first fill at the night's collection after this, so that's the first real test on them. Lesson for the next person: `convex run` gives up at five minutes and prints only "Error" while the server carries on, so read the action's Completion line in `npx convex logs --jsonl`.
- 2026-11-05, a fault that was there before this build: Google spells a page with and without its last slash. One row spelt the other way put a page's routes under one number and its visits under another, so the basket read 99.9% left on Last 3 months against 61% on a month (first noticed 4 November, and then hidden from the eye instead of fixed). A page now takes its slashed name wherever that's seen at all.
