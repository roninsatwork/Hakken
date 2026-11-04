# Plan: All pages as Way 6, and Ask Hakken reading it

**Written 2026-11-04 at Anthony's request: "ok we need to make a plan for this and also make sure ask hakken is working
correctly with the new updates data". Anthony said to build it on 4 November ("i said build it ages ago"). See Progress for
what's built.**

The drawing is board "Way 6" on the canvas "Hakken — All pages, some ways to do it"
(https://claude.ai/artifact/3UgSunN3USQjLNi5Rt96Yc), on More Handles' real figures for October 2026. It's saved under
`docs/plans/assets/all-pages-way-6/` and is the look built to.

This replaces the look agreed on 13 October in `all-pages-rethink-plan.md`. That plan stays as the record.

**Ask Hakken and the eye are part of this page, not an extra.** The page isn't done until Ask Hakken answers the page's own
questions correctly, on the page's own figures (steps 7 and 8). Being able to read the page isn't enough. Anthony, 4
November: "ask hakken is part of every page".

## How long

**About 15 days for a developer.** As agent work, about 4½ days. Part of Ask Hakken's step was done on 4 November (see Progress).

| Step | What | Days |
|---|---|---|
| 1 | The four boxes | 1½ |
| 2 | Search, basket and account pages left out | 1½ |
| 3 | The map, as a new standard part | 2½ |
| 4 | Views each day | 1 |
| 5 | The table | 1½ |
| 6 | The dot chart, as a standard part | 1 |
| 7 | What Hakken sees on this page | 2 |
| 8 | Ask Hakken on this page | 2½ |
| 9 | Checking it all | 1½ |
| | **Total** | **15** |

## What the page shows, top to bottom

Anthony picked these by comment on 4 November, in this order.

1. **The header:** All pages, with "See how often people looked at each page on your website, and whether that went up
   or down."
2. **Four boxes:** Way 4's boxes, changed to page views ("we need to change the intent to page views").
3. **A map of your pages** ("add this as the first component").
4. **Views each day** ("add this as the second component").
5. **The search row and the table** ("add this to the new page 6").

The dot chart isn't on this page ("we don't need this on 6"). It stays a standard part (step 6).

## Step 1. The four boxes

| Box | October on More Handles | Line under it |
|---|---|---|
| Page views | 152,926 | 8.9% fewer than September |
| Pages a visit | 4.3 | 4.5 in September |
| Busy pages, fewer views | 101 | Out of 170 pages with 50 visits or more |
| Quiet pages, more views | 2,203 | Out of 9,137 pages with under 50 visits |

- The first two are the whole website, so they match Overview and Visits.
- The last two leave out search, basket and account pages, so they match the table.
- A page counts as fewer or more when it moves by 3 views or more, the same as the table.
- **Busy is 50 visits a month.** I suggest it grows or shrinks with the days chosen: about 12 on a week and 600 on a year.
  The line under the box says the number. Otherwise nothing is busy on a week, and far too much is on a year. You haven't
  seen this on the board, as Way 6 only shows October.

## Step 2. Search, basket and account pages left out

**Why.** They get 1 in 5 of all views, and they took 3 of the top 4 rows on today's table. They crowd out the pages a
shop can do something about.

- The page opens with them left out. The Classification menu says so: "All but search and basket". Choosing "Every
  classification" puts them back.
- They're found by their web address, with one short list for each shop platform: Magento, Shopify, WooCommerce and
  BigCommerce. A website with no matching pages shows every page, and the first menu choice doesn't appear.
- **Search, basket and account** is a choice in the Classification menu, but it isn't a real classification. Those pages
  stay in Not sorted yet on every other screen. Nothing saved changes.
- The filters, the boxes, the map and the download all follow the menu.

## Step 3. The map, as a new standard part

Anthony: "please make this a new standard component", and "remember the rollover states and hover states".

**The new part is `PageMap`,** built on the map we already have (`SiteTreemap`), so any page can use it.

- **Each box is a page.** The bigger the box, the more it had. Orange went up since September and grey went down. The
  deeper the colour, the bigger the move. The arrow and the words say it too, because Anthony can't tell red from green.
- **Rollover.** The box under the mouse lights up with an outline, and the others step back.
- **Hover.** The page's name, its figures for October and September, up or down, its visits or views and its conversions.
  It follows the mouse. Small boxes have no words, so this is how you read them.
- **Pressing a box** opens that page's own screen.
- **Count menu:** Views or Visits. It changes the size, the colour and the hover. ("We need a new box for visits and views.")
- **Classification menu.** The same choices as the table.
- **Colour shows menu:** Views, Visits or Conversions. It follows Count until someone changes it.
- **Forty pages:** the 40 busiest by what Count says. The line under the map says what share of views they got.
  Visits can't be added up, because one visit can look at many pages, so that line says so instead.
- It goes in the drawing kit and `screen-kit.md`, so other agents find it.

## Step 4. Views each day

- Each page ticked in the table gets a line, as today. It opens with the first five ticked. Five is the most.
- **Show menu:** Views, Visits or Conversions. Today it only has views.
- **Your whole website:** a switch, off at first (question 1).
- It uses the standard chart with menus (`ChartExplorer`) and its hover table. Its Better or worse table stays off,
  because Way 6 doesn't have one.

## Step 5. The table

- **Search and filters on one line** ("our table standard"). All, Gains, Dropped, Static and No visits become one
  dropdown, Show, with each count beside its name. Classification is the second dropdown.
- **Columns:** tick, Page, Visits, Views, Up or down, Time on page, Conversions with its rate under it, Up or down.
- **Up or down's heading has a hover:** "Views in October compared with September. A change of 1 or 2 views shows as The same."
- **The bar** says the number of pages and has Download CSV, with no sentence beside it.
- **The footer** is the standard one, with nothing added.
- **The Page column keeps its room.** On a page of the table where every row has a title it can shrink to one letter. This
  was seen while drawing, with the longer headings.
- Only All pages changes. Channels, Campaigns, Funnel and Visits share this table and stay as they are.

## Step 6. The dot chart, as a standard part

Anthony: "this control is lovely please make this a standard component too". It's already a shared part (`SiteScatterChart`)
with its rollover and hover. This adds three things, so any page can use them:

- a scale that stops close to the dots, rather than at the next 10, 100 or 1,000;
- named dots that don't repeat in the key;
- four named groups with a menu above them, as drawn on Way 4.

No page uses it yet. It stays on Way 4 until a page needs it.

## Step 7. What Hakken sees on this page

**Today.** The page has its own findings, tested on all seven dates. They only look at the whole website's views and the
pages that moved most. Search results and the basket come out as the biggest movers. The screen list still describes
today's page.

**The fix**

- **New findings, each compared with something:**
  - page views against September, with visits beside them;
  - pages a visit against September;
  - how few pages do the work ("Half your views came from 219 pages. In September it took 223.");
  - busy pages with fewer views, naming the biggest;
  - the classification that moved most ("Electrical got more than twice the views, 2,610 against 1,002");
  - how much search, basket and account pages lost ("6,158 views, about 2 in 5 of the whole fall").
- **Search, basket and account pages are never named as a page that moved.** They're only spoken of together.
- **The screen list** gets this page's parts, top to bottom, and the things it never talks about: money, and conversion
  rates as if they were visits.
- **The map and the line hand their figures over,** for whichever Count is chosen.
- **Links for "Do first" steps:** a page's own screen, Channels, Funnel and Tracking health.
- **The panel** has Anthony's three parts: figures, what it means, then the chat.
- **Tested on every date the menu offers** on More Handles' saved figures, as AGENTS.md asks. Each date finds the headline
  and at least four things.

## Step 8. Ask Hakken on this page

**Already fixed on 4 November,** on today's page, at Anthony's "we need to fix these". Four real questions on More Handles
came back right (see Progress). Ask Hakken can now read All pages in the order a question needs (biggest falls, biggest
rises), look at one classification with its totals, explain a rate over 100, and warn when page views look counted differently.

**Still to do when Way 6 is built**

- **It reads what the page shows.** Today it starts with search results and the basket, as today's table does. Way 6 leaves
  them out, so it will too, unless asked, and it says they're left out.
- **The other two boxes.** It already has page views and pages a visit. It adds busy and quiet.
- **It can redraw the page's charts:** the map and the lines hand over their figures, so "show that as bars" works.
- **It can draw the map under an answer,** using the new standard part (question 3).
- **It says Classification everywhere on this page.** Its instructions for All pages already do. The rest of the app waits for
  Anthony's answer.

**How we check it**

- **A free test that stays in the code.** For all seven dates, Ask Hakken's figures must equal the screen's. It fails if
  they ever drift apart.
- **Real questions, about 30p at most in all,** at Anthony's OK. On More Handles for October, once Way 6 is built:
  1. "How many page views did we get, against September?" It must say 152,926 and 8.9% fewer.
  2. "How many pages a visit?" 4.3 against 4.5.
  3. "Which pages lost the most views?" Door Handles on Rose first, 1,968 to 1,594, and never search results.
  4. "Which pages gained the most?" The home page, up 492, then Black Door Handles, up 232.
  5. "How did Electrical do?" 1,002 to 2,610.
  6. "Why does the basket's rate look so high?" It must say it counts times, not visits.
  7. "Draw the map by visits."
  8. "Show Views each day as bars."
  9. On Last 3 months: "Did our page views fall?" It must warn first.
- One press of the eye on this page, read in full, words and run log, with its cost said first.
- Anthony reads the answers. A wrong figure is fixed where it comes from, never in one answer.

## Step 9. Checking it all

- Tests for the new reads, the address list, the busy rule, the map and the dropdowns.
- A look test for the approved board. Today's look test and its outline retire.
- Every read the page makes, run on all seven dates on More Handles. Today's list read loads on all seven, on up to 21,934
  pages. A heavier read could bring back the Download CSV fault, because each part of the download reads the whole list.
  So the time is measured before and after.
- Checked on one small website too, Ronins, so busy, quiet and the map work with 60 pages as well as 13,000.
- Checked in Anthony's Chrome against his comments, not against this plan.
- `npm run check` once at the end, then GitHub's own steps: coverage, the smoke tests and the build, in a copy so the app on
  port 3000 keeps running. English and Italian kept level.

## Limits, said now

- **Conversions still count times, not visits.** The rate stays under Conversions and can go over 100 (question 2). You
  can't sort by the rate on its own any more.
- **Dates that cross 3 September still show the false ups and downs in the table.** A warning now says so on the screen, in
  the eye and in Ask Hakken, on Last 3, 6 and 12 months. The figures themselves don't change.
- **The map shows 40 pages.** The table has the rest.
- **The address list only knows four shop platforms.** Another platform's search and basket pages stay in the table.
- **Nothing new is asked of Google.** Every figure is already saved.

## Open questions for Anthony

Each has my recommendation. If you say go without answering, I'll build what I recommend. He said go, so 1, 2 and 3 are built as
recommended. Question 4 is a separate job and isn't done.

1. **The whole website line on Views each day.** On 13 October you agreed it would always show. It's about 5,000 views a day
   against about 300 for a page, so every page sits flat along the bottom. **I recommend a switch, off at first,** as Way 6
   has it. Say "switch" or "keep it on".
2. **The rate under Conversions.** It says "82.5% of visits", and some pages go over 100%. It's really times, not visits.
   **I recommend it says "82 per 100 visits",** so a figure over 100 still makes sense. Say "per 100 visits" or "leave it".
3. **Ask Hakken drawing the map.** **I recommend yes,** because it's now a standard part. It's in the days above. Say "yes" or
   "not now".
4. **"Kind of page" on built screens.** At least 24 places still say it, across Channels, Visits, Funnel and Conversions.
   **I recommend changing them all to Classification as a separate job,** as it reaches screens this plan doesn't touch.
   Say "change them" or "not now".

## For the builder: where things live

- **The page:** `src/app/(dashboard)/app/analytics/[siteId]/all-pages/page.tsx`. **The table:**
  `_components/AnalyticsListScreen.tsx` (`COLUMNS.page`, `columnOf`, `usePlotted`, `AnalyticsDownload`, `readListInParts`).
  The Download CSV fix there is on dev and not committed: build on it, don't undo it.
- **The list read:** `convex/googleAnalyticsReads.ts` (`readAnalyticsList`, `readListPage`), `convex/googleAnalyticsPageMoves.ts`
  (`withQuietPages`), `convex/utils/pageMoves.ts` (`moveOf`, `MOVE_VIEWS`, `MOST_PLOTTED`; the busy rule goes here).
  Rows carry `change` for visits; add `visitsBefore` for the map. `group` already narrows to one classification.
  The address list goes in a new `convex/utils/shopPages.ts`.
- **The whole website's figures:** `analyticsChart` and Overview; the figures on Way 6 use 35,739 visits, Visits' own figure.
- **The line:** `PagesDailyChart` in `_components/AnalyticsChart.tsx`, `analyticsPagesDaily` in
  `convex/googleAnalyticsPageReads.ts`, which returns views only today (`readPageSeries` holds the rest).
- **The map:** `src/app/(dashboard)/app/sites/_components/SiteTreemap.tsx`. Its rollover and hover were added on 4 November and
  aren't committed. The drawing's copy is in Way 6's HTML. Add to `screen-kit.md` and `scripts/drawing-kit/parts.tsx`.
- **The dot chart:** `SiteScatterChart` in `SiteCharts.tsx` (`logAxis`, `legendType`, `ScatterLabels`).
- **The filter dropdown:** `Select` with `chip`, as `screen-kit.md` says under "Filters on the search row".
  `ConversionsCell` already draws the rate under the count.
- **The eye:** `convex/utils/sees/own/googleAnalytics.ts` (`allPagesFindings`), `screenEntries/googleAnalytics.ts`
  (`googleAnalytics.allPages`), `googleAnalyticsPeriods.test.ts`, the fixture `src/test/fixtures/moreHandlesAllPages.json`.
  Read `docs/developer/what-hakken-sees-guide.md` first.
- **Ask Hakken:** `convex/assistantAnalyticsReads.ts` (`LISTS`, `pageRowOf`, `googleAnalyticsInternal`),
  `convex/toolConnectorDefinitions.ts` (the screen tool at about :611, `redraw_page_chart` at about :818),
  `convex/utils/assistantPageCharts.ts`, `convex/utils/startedOn.ts`, `src/ui/components/chat/AnswerChart.tsx`.
- **Tests that will change:** `googleAnalyticsLook.test.tsx` and `docs/plans/assets/all-pages-rethink/look/AllPages.txt`,
  `convex/utils/pageMoves.test.ts`, `convex/googleAnalyticsReads.test.ts`, `convex/assistantReads.test.ts`,
  `src/analytics-sees-drift.test.ts`, `src/ask-hakken-chart-pages-drift.test.ts`, `src/pagination-drift.test.ts`,
  `src/translation-parity-drift.test.ts`, `src/seen-words-drift.test.ts` (run `node scripts/seen-words.mjs`).

## Progress

- 2026-11-04: five ways drawn, then Way 6 made with Anthony by comment. Ask Hakken's read checked, read-only. This plan
  written. Way 6 itself isn't built. Overall: about 5%. Drawing: done, waiting on approval.
- 2026-11-04, at Anthony's "we need to fix these", on today's All pages, on dev and not committed:
  - **Biggest falls and rises.** `read_google_analytics` takes `order`, `classification` and `move` for allPages.
  - **One classification.** Its totals include pages that went quiet (`groupTotals`, from the list's own `totals`).
  - **The basket's 302.** The field is `conversionsPer100Visits`, with `conversionsRule` beside it.
  - **False falls.** `convex/utils/viewsCounted.ts` spots them from a website's own figures, so no date is written down. The
    screen shows a Notice, the eye a `countedDifferently` finding, and Ask Hakken a `warning`, on allPages and overview. On
    More Handles it speaks on Last 3, 6 and 12 months, and not on the shorter dates.
  - **Asked for real in Chrome, on More Handles, 8 credits:** which pages lost most (search results first, 2,125 down, correct
    for today's table); how did Electrical do (2,610 from 1,002); the basket's rate (302 per 100 visits, explained); did page
    views fall over 3 months (warned first, then 656,318 from 968,839 with visits up 8.2%).
  - **Checked:** the affected tests (747), the type check and lint on the changed files. `npm run check` not run yet.
  - **Fifteen look tests failed, not from this work, and are now fixed.** The eye's words began coming in one at a time that
    morning, each in a piece of its own, so tests looking for a whole sentence found nothing. They now use `findSaid` and
    `saidInPanel` (`src/test/openHakkenSees.ts`), with a guard in `src/test-time-limits-drift.test.ts` and a rule in AGENTS.md.
    No screen changed. `npm run check` still to run.
- 2026-11-04, a correction. My September figures by classification on Ways 1, 2 and 5 left out pages that went quiet. The
  right figures are in the note on the canvas and in this plan.
- 2026-11-04, Way 6 built, on dev and not committed. Anthony: "i said build it ages ago".
  - **The page.** Four boxes, the map, Views each day, one-line menus and the table, in `all-pages/page.tsx` and
    `_components/AllPagesParts.tsx`. Questions 1, 2 and 3 are built as recommended.
  - **Standard parts.** `PageMap` and `DotGroups` in `src/ui/components/screens/`, `ExplorerToolbar` in `ChartExplorer.tsx`,
    `scale="tight"` on `SiteScatterChart`. The map's figures now follow the mouse on every `SiteTreemap`, as the hover used to sit
    in the middle of the box.
  - **Figures against the board.** 13,397 pages against 13,401, 2,202 quiet pages with more views against 2,203, and 9,133 quiet
    pages against 9,137. The address list is a little wider than the board's, and takes in Searchanise, a search app.
  - **The Page column's least width is 160 pixels, not the board's 220,** or the table runs off the page at 1366 pixels. The rate's
    words are Inter and its number JetBrains Mono, so "302 per 100 visits" stays on one line.
  - **With one classification chosen,** the Page views box shows that classification's views. Pages a visit stays the whole
    website's and says so, as visits can't be added up across pages.
  - **The eye.** New finding kinds `halfOfViews` and `busyFewer`, and rules for pages a visit, classifications and the shop's pages.
    Shop pages are never named as a page that moved. The fixture was rebuilt, and all seven dates pass.
  - **Ask Hakken.** `read_google_analytics` leaves shop pages out by default, says so, and takes `everyPage`. It answers
    `busyAndQuiet` and `halfOfViews`. `redraw_page_chart` can draw a `map`, from a conversation started on the page. The main chat,
    with no page behind it, can't draw the map: it has bars, pies and the rest.
  - **Checked.** All the page's reads on all seven dates on More Handles. The list read on Ronins, Korda, NEC and Hurtwood House.
    The screen itself was only seen on More Handles, as Chrome is in Period House Group's workspace.
- 2026-11-04, a change from the board and question 1. Anthony, on seeing the whole website's line alone: "make this the default
  view". Views each day now opens with Your whole website on and no page ticked. Ticking a page adds its line. The switch stays,
  because on one scale a ticked page sits low beside the whole website.
- 2026-11-04, checked. Overall: 100% of the plan's steps. Question 4 isn't done, and nothing is committed.
  - **Real questions on More Handles, October, $0.29 in all.** All right: 152,926 and 8.9% fewer; 4.3 against 4.5; lost most, Door
    Handles on Rose 1,968 to 1,594, no search pages; gained most, the home page up 492, then Black Door Handles up 232; Electrical
    1,002 to 2,610; the basket's 302 per 100 visits, explained as times; the map by visits; Views each day as bars; on Last 3 months
    it warns first.
  - **Three faults those answers showed, fixed:** literal `<br>` in chat tables (`HakkenMarkdown`), "redrawn above" with a table
    repeated (`assistant.pageChart` now gives the same note as the other chart tools), and bars of days ranked by size and cut
    to 20 (they now stay in date order, standing along the dates). Bars asked again, right. `<br>` is held by a test only.
  - **The eye, read in full.** A press cost $0.15 to $0.23 (12p to 18p), not the 5p the guide says, on 34,000 tokens read. The first
    took 4 minutes behind Google's 429s. One press opened its words with "Still,", with nothing before it. Left as it is.
  - **The gate.** `verify:env`, `lint:all`, `check` (8,859 tests), `test:coverage`, `coverage:check`, `test:e2e:smoke` and a build
    in a copy all pass. `git diff --check` is clean. Two backend files had passed the 1,000-line ceiling, so the onward figures moved to
    `googleAnalyticsOnward.ts` and the page chart connector to `toolConnectorPageCharts.ts`. `classificationNamed` reads through
    `readPageKinds`, as its own `.collect()` broke the bounded-read rule.
- 2026-11-04, question 4 answered: "Yes, change them". "Kind of page" and "page kind" now read Classification on every built screen,
  in English and Italian: Overview, Channels, Visits, Funnel, Conversions, Search Console, Visibility's Top pages, Clarity and Insights'
  words. So do Ask Hakken's charts and tools, the eye's prompts and screen list, and the emails' chart words. Comments in code stay. Left on purpose: "What kind of page is
  this?", the admin Decision that sets Hakken's own page types; the instruction that tells Auto Classify what to write; and "Page type",
  the app's name for those types, shown where a website has no classifications. Insights is otherwise still paused: only its words changed.

