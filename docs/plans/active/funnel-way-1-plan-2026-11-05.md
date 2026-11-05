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
- **Eight groups by name, from the second page on.** The rest show together. On More Handles that's six small ones.
- **The chart is taller.** With ten pages and up to nine groups a column, it's about 740 pixels on More Handles.
- **A page keeps the routes that reach the chart's boxes** (`landingRoutes`). The rest of its visits join their groups.
- **Figures from the third page on are close, not exact.** So are a group's in the second column. Google can't say how far into a visit a step came, so they're fitted to the visits that could have reached them. A page named in the first two columns has Google's own figure. A route between two named pages there is Google's own, never more than went on from the first.
- **Orange dots only on the top five routes between two columns.** On a shop nearly every route has a conversion, and a dot on each hid the chart.
- **Select top 10 takes the first ten rows of the page of the table in view,** in the order it's sorted. On page 2 of the table, that's page 2's top ten.
- **From the third page on, figures are worked out, not counted.** Google gives one step at a time, not whole journeys. Where a ticked page's visitors go is from its own saved steps. How many are left at each page is held to Google's own views for that page: its views past each visit's first are those who stayed, then those who went on from them, so the share going on is 1 − stayed ÷ further views. On the Home page in October that's 90%: 3,377 → 3,040 → 2,736 → 2,462. So every box in a column loses about the same share, unless a page has no steps after it. The share is a little high where people reload a page, as a reload counts as a view. A column is never raised above what the saved steps reach.
- **The September line** on the daily chart only shows on dates held day by day: weeks and months, as on Visits.
- **Conversions count times, not visits,** as everywhere in this section. That's why it says "per 100 visits".
- **Plain names** cover four shop platforms. Any other page takes its name from its address.
- **Saved data grows** by one list a date, device and home country (`landingRoutes`). Measured on a year of More Handles: 48,751 route rows in 25 parts, beside 1,255 flow rows and 11,766 onward rows. A route of under half a visit isn't kept.

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
- 2026-11-05, build: steps 1 to 6 built and checked in Chrome. Anthony asked mid-build for a Clear all and a Select top 10 as a standard table part: `TableTicks.tsx` (`tickColumn`, `TickCount`, `TickActions`), on Funnel and All pages. He then asked for a better look and for clearing to mean something; three ways were drawn on the canvas (board Ticks) and he picked Way 3, two proper buttons beside Download with "10 of 10 on the chart" in the bar. With nothing ticked, the chart is a message and a Select top 10 button. His next message: "i have 1 item selected on the table and the funnel is full". He was right: ticks only changed the first column, and I'd tested that a box moved, not that the chart did what a tick means. Now each page's own routes are saved all five pages deep, against the chart's boxes (`landingRoutes`), and the chart is only what's ticked. Nothing else is on it, and the whole website's chart is read only by the eye and Ask Hakken. My first go stopped at the third page on a busy page, as the old joining-up used every step by then; my own Chrome test caught it before it reached him. Step 7: own findings for every date, one press read in full ($0.094, about 7p, one rewrite). Step 8: three reads (`landingPages`, parts `boxes` and `chart`), a free test against the screen, and a page's routes on a redrawn chart (`only`).
- 2026-11-05, a year of More Handles: the fill failed many times before it was right, and I named the wrong cause more than once before I had the evidence. Timing notes showed Google answering at 3 to 12 seconds a page depending on the hour, and 68 answers for a year. Now: only the visits are asked for the routes, arrivals are one row, who went on is held as a number each, a flow's list has half a list's room, the steps are let go once copied, a group's two asks go side by side and two groups go at once. A year took 440 seconds on a slow hour with 48,751 route rows in 25 parts. Tried and thrown out: reading only Google's first 250,000 rows, which comparing the table's figures showed lost 27% of the visits that stayed, as a page's going-on can't pass the routes seen leaving it. A long date's route job starts in a step of its own. Lesson for the next person: `convex run` gives up at five minutes and prints only "Error" while the server carries on, so read the action's Completion line in `npx convex logs --jsonl`, and saving code to `convex/` during a long run can mark it failed at 635 seconds even when its work was saved.
- 2026-11-05, my fault in this build, found in my last check: Home's Left read 16.6% on October and 3.8% on a year. When a long date's rows were added up by group, a reload (Home to Home) became a step to Home's group, so Home's first steps looked bigger than its visits and stopped holding its Stayed down, and the chart showed thousands going from Home to Brand. A reload is now let go when it's added up (`flowRowGroup`). Proved on October against Google's own rows: Home's first steps went from 5,309 to 3,312, and Google's say about 3,304 once shared to the home country. Also measured on Google's own rows and not fixed, as it's what the website recorded: visits starting on Home had about 20 page views each until August 2026 and about 9 since September, and Google's own "left straight away" falls on long dates to match (Home 16% on a month, 4% on a year). So the long dates' deep columns read higher than the short dates'. Cause on the website not known.
- 2026-11-05, the second fault that check found: a page read 95% left on a year and 72% on six months. One ask reads at most Google's 20 answers (500,000 rows), a year of More Handles' busiest 2,000 landing pages is 783,855 rows, and what's cut is the smallest rows, which is most of an advertised page's routes. The year's going-on (511) was even lower than six months' (1,439). The busiest group is now asked in pieces of 10, 40, 200 and 750 pages, then the rest (`flowGroups`), and the same page reads 72% left, 2,641 going on. No group on six months passes the limit. A website ten times the size could still pass it on its busiest pieces, and the list's `cut` would say so.
- 2026-11-05, not solved: each year's fill on More Handles since 14:38 saved everything in about seven minutes, and a note proved the action's code reached its last line, yet Convex logged "Your request couldn't be completed" at 635 seconds. The clean run at 13:31 was the same code bar the notes. I don't know why. Saved figures are right. Look at the night's run on 5 November for what it does to a long date's step. Google tokens today on More Handles: about 46,000 of 200,000, more than the one collection agreed.
- 2026-11-05, after he saw it on his own screen: "why is this so huge on full screen". The chart was drawn 860 wide and stretched: on his 3,200-wide screen, 3 times, with 33 pixel words, and 1,410 tall. I had only looked at it in a normal window. It's now drawn in real pixels at the page's width (`PageFlowChart`, `useElementWidth`): 13 pixel words, 524 tall on his screen with Home ticked in October, boxes up to 260 wide, then longer routes. A guard (`src/chart-size-drift.test.ts`) and a rule in AGENTS.md hold it.
- 2026-11-05, a fault that was there before this build: Google spells a page with and without its last slash. One row spelt the other way put a page's routes under one number and its visits under another, so the basket read 99.9% left on Last 3 months against 61% on a month (first noticed 4 November, and then hidden from the eye instead of fixed). A page now takes its slashed name wherever that's seen at all.
