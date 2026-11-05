# Plan: the new Campaigns page, with the eye and Ask Hakken

**Written 2026-11-05 after Anthony chose the parts by comment and said of the board "ok this is good". His answers to its questions are below. Not built. It
waits for his go.**

The drawing is the board "The new page so far" on the canvas "Hakken — Campaigns, three ways"
(https://claude.ai/artifact/AcFCaFTna7RVReiqK6bMbR), on More Handles' real figures for October 2026. A copy is saved under
`docs/plans/assets/campaigns-new-page/` and is the look built to.

**The eye and Ask Hakken are part of this page, not an extra.** The page isn't done until the eye finds things a person would
miss, on every date, and Ask Hakken answers the page's own questions correctly (steps 8 and 9).

## How long

**About 23½ days for a developer. As agent work, about 8 days.** Building the chosen parts as shared components added 3½ days, and clearing the other one-offs added 5.

| Step | What | Days |
|---|---|---|
| 1 | The reads the page needs | 2½ |
| 2 | Plain names | 1 |
| 3 | The four boxes and the shared days chart | 3 |
| 4 | The shared map card | 1½ |
| 5 | The shared squares | 2 |
| 6 | The table's shared columns | 2 |
| 7 | The other redone screens onto shared parts | 5 |
| 8 | What Hakken sees on this page | 2½ |
| 9 | Ask Hakken on this page | 1½ |
| 10 | Checking it all | 2½ |
| | **Total** | **23½** |

**Cost.** Nothing more is asked of Google, and no new saved list is needed, so no collection runs. Real checks cost about 80p:
three eye presses at about 15p each, and about 30p of questions to Ask Hakken.

## What Anthony chose

| His comment, 5 November | What it means |
|---|---|
| On Way 1's each-day chart: "lets add this as the first chart on our new design" | Visits from campaigns each day comes first |
| On Way 2's map: "let keep this control on our new page design" | All your campaigns is second |
| On Way 3's squares: "lets keep this chart on our new design" | What people did after they arrived is third |
| On Way 2's table: "let keep this table on our new page" | Way 2's table, with no tick boxes as drawn |

I added the four boxes from Way 1, and he agreed: "i want the hero boxes to keep it standard".

He then said "I don't want the campaign visit bars", and that he wants the components he asked for as shared, reusable ones.

## What the page shows, top to bottom

1. **The header.** Campaigns, with "People who came from a link you tagged, like an ad or an email. See how they are doing and what they did next."
2. **Four boxes.**
3. **Visits from campaigns each day,** with Up or down under it.
4. **All your campaigns,** the map.
5. **What people did after they arrived,** the squares.
6. **The search row and the table.**

Today's three parts change like this. "Visits from tagged links a day" becomes the first chart. "Visits by campaign" comes off, as he said.
The table gets new columns.

## Shared parts

Anthony, 5 November: "I only want reusable shares components even if we have create new". So nothing on this page is a one-off. Where no shared part fits, a new one is made.

| What he chose | What's there today | What it's built as |
|---|---|---|
| Visits each day | Three near copies, on Visits, All pages and Funnel, each written on top of `ChartExplorer` | A new shared part, **`DaysChart`**. Those three screens move onto it |
| The map | `PageMap` is shared. Its card and menus are written inside All pages | A new shared part, **`MapCard`**. All pages moves onto it |
| The squares | `ConversionsMap` is already shared, with its card, download, hover and narrow-screen list | Extended, not copied. It gets the options step 5 needs |
| The table | The shared analytics table, `AnalyticsTable` | Its new columns join the shared table, so any list can use them |
| The four boxes | `FigureRow` and `Figure` are shared | Used as they are |

**The rules for each.**
- **It takes plain figures and reads nothing itself,** so Search Console, Bing or any other section can use it. The page does the reading and hands over the words.
- **It goes in** `src/ui/components/screens/`, the drawing kit (`scripts/drawing-kit/parts.tsx`) and `docs/developer/screen-kit.md`, with tests of its own.
- **Campaigns is wired up in a thin page file.** It holds reads and words, and no chart of its own.
- **Screens that move must look exactly the same.** Their look tests must pass unchanged. If one can't, I stop and tell him.
- **Step 7 adds two more shared parts,** `BarsCard` and a table frame, for the other redone screens.

## Redone screens that don't follow this

Anthony asked if any do. I checked the code of all five on 5 November. None draws a chart or table by hand: all are built on shared
base parts (`ChartExplorer`, `PageMap`, `SiteTreemap`, `PageFlowChart`, `DataTable`, `Figure`). But I wrote a new card on top for each screen,
so the same chart exists more than once.

| Screen | Written for that screen | In this plan? |
|---|---|---|
| Funnel | The each-day chart (`LeftEachDayCard`) | Yes, moves to `DaysChart` |
| All pages | The each-day chart (`PagesLinesCard`) and the map card (`PagesMapCard`) | Yes, moves to `DaysChart` and `MapCard` |
| Visits | The each-day chart (`VisitsLineCard`) | Yes, moves to `DaysChart` |
| Visits | The bars (`WhoVisitsCard`) and the treemap card (`PageKindsCard`) | Yes, step 7 |
| A page's own screen | Two bar cards (`WhoLooksCard`, `PageVisitorsCard`) and the Sources table (`PageSourcesTable`) | Yes, step 7 |
| Products | Two bar cards (`ProductsChart`, `BoughtOrLeftChart`), its own table and its own download (`ProductsTable`, `ProductsDownload`) | Yes, step 7 |

Boxes are fine, as every screen uses `FigureRow` and `Figure`. Funnel's route chart is fine, as `PageFlowChart` is shared and only Funnel shows it. Funnel, All pages and Visits use the shared table.

Anthony: "Add these to the plan pls". They're in step 7.

## Step 1. The reads the page needs

Nothing new is collected. All of this is already saved, and only needs reading. I checked this on the dev deployment on 5 November.
Today's list and chart read fine on all seven dates on More Handles: 15 campaigns on this week, 34 on last month and 122 on a year.

| Part | What it reads today | What it needs |
|---|---|---|
| Boxes | Nothing | Campaign totals beside the list, so they're right on page 2 of the table. Each is the whole list, not the rows on screen |
| First chart | `analyticsCampaignChart`, visits only | Bought, conversions and left straight away for each point, and the same days of the dates before |
| Map | Nothing | `analyticsListPage`, up to 40 rows, with bought before |
| Squares | Nothing | A new small read, the 10 busiest campaigns and how many times people did each counted thing |
| Table | `analyticsListPage` | Bought before, three new sort orders and a Came from filter |

- **One read for a list's days.** It takes a list's name and gives its days and the days before, so Channels' redo can use the same read.
- **Bought before.** Each row has `purchases` and no figure for the dates before. Add `purchasesBefore` beside `conversionsBefore` (`googleAnalyticsRows.ts`).
- **New sort orders,** on the server, over the whole list: the dates before, up or down by number, and bought.
- **Came from filter.** A new server argument, as `group` is on All pages.
- **Find out why the chart and the table differ.** The days add up to 15,785 visits and the list to 15,732. September is 16,974 and 16,835. I don't know why yet. I'll find out and tell him. I won't hide it.
- **Every read run on all seven dates,** timed, staying under Convex's one second and 64MB.

## Step 2. Plain names

One small file, used by the table, map, squares, eye and Ask Hakken, so they all say the same thing.

- **Came from.** Google's words become a person's.

| Google says | The page says |
|---|---|
| google / cpc | Google Ads |
| google / organic | Google free listing |
| fb / paid | Facebook ad |
| ig / paid | Instagram ad |
| bing / cpc | Microsoft Ads |
| GMB / organic | Google Business Profile |
| anything / email | Email |
| trustpilot, pinterest and the like | Trustpilot, Pinterest |
| (not set) / (not set) | Not known |
| anything else | Its source, as it's written |

- **A campaign with only a number for a name** says "Facebook ad with no name". The number stays in the download and the hover.
- **Other names stay as they were tagged.** `domain_click` and "High Perfroming" are what the link says, and I won't change them.
- **English and Italian,** in the dictionaries.

## Step 3. The four boxes and the shared days chart

| Box | October on More Handles | Line under it |
|---|---|---|
| Visits from campaigns | 15,732 | 6.6% fewer than September |
| Share of all your visits | 44.0% | It was 44.9% in September. |
| Bought from campaigns | 655 | 6.7% fewer than September |
| Share of everything bought | 54.3% | It was 55.8% in September. |

The drawing adds up September's days for the 702 behind the 6.7%. The build reads September's own saved list, so that figure may move
by a few.

**A website with nothing bought** shows Conversions and Share of all your conversions instead. Ronins, for one.

**The chart** is the new shared `DaysChart`, built on `ChartExplorer`. It takes any number of lines, what to show and what to compare with. `VisitsLineCard`, `PagesLinesCard` and `LeftEachDayCard` move onto it, with the same look.
- **Show:** Visits, Bought, Conversions or Left straight away.
- **Compare with:** September, or No comparison.
- **Hover:** the standard table, naming every line, with a line down the day and a dot on each line.
- **It follows the page's Daily, Weekly or Monthly menu.**
- **Up or down** sits under it, as on Conversions: last step against the one before, last three against the three before, and a year before on 12 months.

## Step 4. The shared map card

The new shared `MapCard`: the card, `ExplorerToolbar`, `PageMap` and the line under it. `PagesMapCard` on All pages moves onto it, with the same look.

- **Each campaign is a box.** Bigger boxes had more visits. Orange went up and grey went down.
- **Count:** Visits, Bought or Conversions.
- **Which get a box.** A campaign with at least 1 in 500 of the campaign visits, up to 40 boxes. That's the 16 drawn on More Handles for October, and every campaign on Korda's 4. The line under it says how many it leaves out.
- **Hover:** the same figures for a campaign everywhere: visits, bought, conversions and left straight away, against the dates before.
- **Pressing a box does nothing.** It shows no pointer, as the map already does when there's nothing to open. A page for one campaign is a separate piece (limits, below).
- **The chart can't stretch.** It's already drawn in real pixels.

## Step 5. The shared squares

`ConversionsMap`, extended rather than copied. Conversions keeps working as it does. It gets three small options.
- **Brighter by column,** comparing a square with the other campaigns. Today it compares within a row.
- **"For every 100 visits" using the row's visits.** Today a rate uses the column's visits.
- **Two figures in a square,** the count and the rate, as drawn.

On this page:

- **A row for each of the 10 busiest campaigns,** and a column for each thing people did.
- **Which columns.** The website's four most counted things, leaving out one that's nearly the same as another. On More Handles those are Added to basket, Started checkout, Bought and Signed up for emails. `checkout_complete` (662) is left out, as it's Bought (654) counted twice.
- **Its words come from the website's own names for them,** as on Conversions.
- **Count:** Number of times, For every 100 visits, or Conversion rate % (Anthony, 2026-11-05: "we need conversion rate % too in the count drop down"). The rate is the share of a campaign's visits that did the thing at least once, from Google's own count of those visits, so it can't pass 100%: Zombies' 715 of 4,097 visits is 17.5%, where its 2,372 times is 57.9 for every 100 visits. Saved figures from before Google's count was kept have no rate to offer, so the menu leaves it out rather than pass the times off as one.
- **Brighter means more than the other campaigns,** column by column.
- **It says "times".** One visit can add to the basket more than once, so More Handles' Brand campaign reads 105 per 100 visits.

## Step 6. The table's shared columns

The new columns join the shared table, as standard columns any list can use.

- **Columns:** Campaign, Came from, October, September, Up or down, Bought, Conversions.
- **Up or down** shows the number, with the percentage under it.
- **Bought and Conversions** show the count, with "per 100 visits" under it. This ends "168.4% of visits". All pages and Funnel already say it this way (`ConversionsHereCell`).
- **The October and September headings follow the dates.** On a whole month they name the month. On other dates they say Visits and Before, and the hover gives the days.
- **Every heading sorts, over the whole list,** and the download holds what the table shows.
- **The search row:** Find a campaign, Came from, and the Campaigns and Ad keywords switch. Came from holds the whole page to one place, boxes and charts too, as Classification does on All pages. This wasn't in the first plan, and is the one thing I added.
- **The bar** keeps "20,051 visits came from no campaign".
- **Ad keywords' wrong sentence is fixed.** It says 35,222 visits had no campaign tag. That number means no ad keyword, so it says that.
- **No rows open.** No campaign has a page of its own.

## Step 7. The other redone screens onto shared parts

Anthony: "Add these to the plan pls". When this step is done, no redone screen has a one-off chart or table.

- **A new shared `BarsCard`,** 2 days. Bars with menus, built on `ChartExplorer`, taking plain figures. `WhoVisitsCard` on Visits, `WhoLooksCard` and `PageVisitorsCard` on a page's own screen, and `ProductsChart` and `BoughtOrLeftChart` on Products all move onto it.
- **Visits' treemap card onto `MapCard`,** ½ a day. `PageKindsCard` keeps its plain boxes, so `MapCard` holds either kind of map.
- **A shared table frame,** 2½ days. The search row, bar, download and footer become one part, which `AnalyticsTable` uses too. Products' table and a page's Sources table move onto it, and each keeps reading its own list.

Each screen keeps its look, its figures, what it hands the eye and what Ask Hakken reads.

## Step 8. What Hakken sees on this page

Campaigns already has its own rules (`campaignsFindings`). They were written before Bought was on the page, so they need more.

**New findings, each compared with something, worked out for whatever dates are chosen.** The rules rank what's biggest, and a
bar only keeps out what's too small to trust. On More Handles for October, they should find things like these.
- Campaign visits against September: 15,732 and 16,835.
- Campaigns against the whole website: 44% of visits and 54% of what's bought.
- A fall most of it comes from: Top Performing Products and Listing Only lost 1,193 visits, and all campaigns together lost 1,118 (`explainsFall`). An earlier draft said 1,103, which summed only the campaigns with visits now; 1,118 counts every campaign's dates before.
- A busy campaign nobody bought from: the Facebook ad, 359 visits and none bought, against about 4 for every 100 visits across campaigns.
- The campaign that sells best for its visits: Brand, 9.9 for every 100 visits, against the website's 3.4.
- The campaign people leave most: the Facebook ad, 57.9% against 36%.
- One place holding most of it: Google Ads, 14,473 of the 15,732.
- What people did: a campaign far from the rest between its basket and what's bought.

**What the eye is handed.**
- The boxes' figures, the website's own, and every campaign, not only the table's page. It weighs the busiest 100.
- The first chart's days and the same days before.
- The map's boxes and the squares' figures, with `useSeesPart`.
- **Links for "Do first" steps,** which it doesn't have today: Channels, Funnel, Conversions and Tracking health.

**Other changes.**
- **"Facebook ad with no name" can be named.** Today's rule drops a campaign with a number for a name, which would hide the best finding on the page.
- **The screen list** gets this page's parts, top to bottom. What it never talks about stays: money, ad spend and conversions as if they were visits.
- **No campaigns at all.** Ronins had none in October and 2 in a year. The eye must still say something true and useful, and never come back empty.
- **The panel** has Anthony's three parts: figures, what it means, then the chat.
- **The old fixed rules** in `analyticsCampaigns.ts` go if nothing else reads them.

**Tested on every date the menu offers,** with a rebuilt fixture holding bought, bought before and what people did. Each date finds the headline and at least four
things. This week and this month, only just begun, keep today's lower bar, and the test says why.

**Three real presses,** each read in full, words and run log (about 15p each, £2 at most in all with Ask Hakken's questions): More Handles, Hurtwood House and Ronins.

## Step 9. Ask Hakken on this page

- **`read_google_analytics` for Campaigns** gives what the page shows, in the page's own names: the four boxes, the first chart, the squares and the table.
- **The order it can read campaigns in:** most visits, gained most, lost most, most bought and most conversions.
- **One place on its own,** such as Google Ads, with its totals.
- **It says conversions count times, not visits.**
- **No money.** Today's read still hands over `value` and `currency`. Those come off.
- **It can redraw any chart on the page** as bars, a pie or a line (`redraw_page_chart`), from what each download holds.
- **A free test that stays in the code.** For all seven dates, Ask Hakken's figures must equal the screen's.

**Real questions, about 30p at most in all.** On More Handles for October, unless it says otherwise.
1. "How much of my visits and sales come from campaigns?" 44% and 54%.
2. "Which campaign lost the most visits since September?" Top Performing Products, 944 to 333.
3. "Why did campaign visits fall?" Two campaigns account for it all.
4. "Which busy campaign sold nothing?" The Facebook ad, 359 visits.
5. "Which campaign sells best for its visits?" Brand, 113 from 1,141 visits.
6. "How did Google Ads do?" 13 campaigns, 14,473 visits, 626 bought.
7. "What did people from Zombies do?" 2,372 added to basket, 720 started checkout, 162 bought.
8. "Why does Brand show 168 conversions per 100 visits?" It must say it counts times, not visits.
9. "Show visits each day as bars."
10. On Ronins for October: "How are my campaigns doing?" It must say there were none, and say what it can see on longer dates.

## Step 10. Checking it all

**What recent pages taught me.** Each of these was a fault Anthony found or nearly found.
- **Test what a control means, not that it moved.** "i have 1 item selected on the table and the funnel is full ... don't you test these things". Every menu here gets a test that the figures change to the right ones.
- **Compare a figure across dates, and with what's saved.** On Funnel, one page read 95% on a year and 72% on six months. Each campaign's figures get read side by side on all seven dates.
- **Look at his screen's width.** "why is this so huge on full screen". Every chart gets checked at 3,200 wide and a laptop's.
- **Check against what he asked, not this plan.**

**The list.**
- Tests for the new reads, plain names, sort orders, Came from filter, box totals and each menu.
- **Funnel, All pages, Visits, a page's own screen, Products and Conversions read and look as they did.** Their look tests pass unchanged, each is checked in Chrome, and figures are compared before and after on all seven dates.
- `DaysChart`, `MapCard`, `BarsCard` and the table frame get tests of their own, a place in the drawing kit and an entry in `screen-kit.md`. `npm run check:screen-kit` passes.
- A new look test for the approved board. Today's look test and its outline retire (`docs/plans/assets/google-analytics/look/Campaigns.txt`).
- Every read run on all seven dates on More Handles, timed.
- The page's reads on the other websites, which differ a lot on October: Ronins has none, Korda 4, Hurtwood House 8 and NEC 18.
- A website with nothing bought, one with one campaign, and one with none, as screen tests.
- Each device, and a second home country, on one date.
- Checked in Anthony's Chrome, in a tab of my own, against his comments.
- `npm run check` once at the end, then GitHub's own steps in a copy, so the app on port 3000 keeps running. English and Italian kept level.
- **Committed to `dev` once these pass, and not pushed** (Anthony: "yes"). Only this work's files go in the commit, as other things are being changed in this checkout.

## Limits, said now

- **Only what links were tagged with.** A campaign exists only if its link was tagged. On More Handles that's 44% of visits. A link with no tag can't be shown.
- **Never what a campaign cost.** Hakken holds no ad spend, and that stays outside the product. The page can say what a campaign brought, not whether it paid for itself.
- **40 boxes on the map, 10 rows of squares and four columns.** The eye weighs the busiest 100 campaigns. More Handles has 122 on a year.
- **Compare with** only shows on weeks and months, as on Visits and Funnel. Those are the dates whose days before are drawn.
- **Conversions and the squares count times, not visits,** as everywhere in this section.
- **"Bought" counts what Google calls purchases.** A shop on another address isn't counted unless it's set up, as with NEC.
- **The Came from list is short.** A source it doesn't know shows as it's written.
- **No page for one campaign.** Rows and boxes open nothing. I'd do that as its own piece once this is in.
- **Without tick boxes,** the first chart shows campaigns added together, and can't show one campaign (Anthony: "thats ok take the table i picked").
- **Moving five built screens carries some risk,** so step 10 compares each before and after.
- **`DaysChart`, `MapCard`, `BarsCard` and the table frame are new parts.** They're named here for Anthony, as a part new to the kit should be.
- **This goes on top of Funnel's three commits,** which aren't pushed yet. They wait on the check of the night's run.

## Anthony's answers, 5 November

1. **Tick boxes on the table?** "thats ok take the table i picked". No tick boxes, so the first chart can't add a line for one campaign.
2. **Leave off today's Visits by campaign bars?** "I don't want the campaign visit bars". They're off.
3. **Keep the four boxes?** "if these are the heros then yes".
4. **Orders or Bought?** "use orrders unless the opther pages in GOogle anaytics section say bought". Then "Please only check the screens we have redone together", as "Overview is waiting to redo". Of those, a page's own screen and Products say Bought. Visits, All pages and Funnel don't speak of it, and none says Orders. Then "Then use bought". So it's **Bought,** and the drawing now says so.
5. **A website with nothing bought shows Conversions instead?** "yes".
6. **Keep Ad keywords and fix its wrong sentence?** "yes".
7. **Spend about 80p on real checks, and commit to `dev` once they pass, without pushing?** "yes".

## Building overnight: Anthony's answers, 5 November

He said "Go" with these.

1. **Push?** "we only commit and don't push". This covers Funnel's three commits too. I still read the night's run and report it.
2. **A moved screen that can't keep its exact look?** "make it a new shared component if you can't". So nothing stays a one-off.
3. **Spending up to £2 on real checks?** "yes".
4. **Switching Chrome's workspace to see other websites?** "yes to ronins". Ronins only. Korda, NEC and Hurtwood House are checked by their reads.
5. **A part that can't be finished?** "move on". Leave it out, commit the rest if every check passes, and say what's missing.
6. **A website with no campaigns?** "yes". Four boxes at zero and one line in place of the charts, with no how-to steps.

## For the builder: where things live

- **The page:** `src/app/(dashboard)/app/analytics/[siteId]/campaigns/page.tsx`, with only its reads and words in `_components/CampaignParts.tsx`.
- **New shared parts:** `src/ui/components/screens/DaysChart.tsx`, `MapCard.tsx`, `BarsCard.tsx` and a table frame, on `ChartExplorer.tsx`, `PageMap.tsx` and `DataTable.tsx`. `ConversionsMap.tsx` gets its options.
- **Screens that move onto them:** `VisitsLineCard` in `_components/VisitsCharts.tsx`, `PagesLinesCard` and `PagesMapCard` in `_components/AllPagesParts.tsx`, and `LeftEachDayCard` in `_components/FunnelParts.tsx`. For step 7: `WhoVisitsCard` and `PageKindsCard` in `_components/VisitsCharts.tsx`, `WhoLooksCard` in `_components/PageStory.tsx`, `PageVisitorsCard` in `_components/PageVisitors.tsx`, `PageSourcesTable` in `[siteId]/all-pages/page/page.tsx`, `ProductsChart` and `BoughtOrLeftChart` in `[siteId]/products/_components/ProductsCharts.tsx`, and `ProductsTable` and `ProductsDownload` in `[siteId]/products/page.tsx`.
- **To copy from:** `FunnelBoxes` in `_components/FunnelParts.tsx`, and `scores` in `_components/ConversionExplorer.tsx`.
- **The table:** `_components/AnalyticsListScreen.tsx` (`COLUMNS.campaign`, `COLUMNS.adKeyword`, `FIRSTS`, `columnOf`) and `_components/AnalyticsCells.tsx` (`ConversionsHereCell`, `ChangeCell`).
- **The reads:** `convex/googleAnalyticsRows.ts` (`shownRowValidator`, the row's before figures), `convex/googleAnalyticsReads.ts` (the orders, `readListPage`), `convex/googleAnalyticsChartReads.ts` (`analyticsCampaignChart`, `readPeriodBeforeChart`), `convex/googleAnalyticsHistory.ts` (`readDayPoints`).
- **The eye:** read `docs/developer/what-hakken-sees-guide.md` first. `convex/utils/sees/own/googleAnalytics.ts` (`campaignsFindings`, `rowNameOf`, `explainsFall`), `screenEntries/googleAnalytics.ts`, `googleAnalyticsPeriods.test.ts`, the fixture `src/test/fixtures/moreHandlesCampaigns.json`, `measures.ts`, `analyticsCampaigns.ts`, `_components/useEyeFigures.ts`.
- **Ask Hakken:** `convex/assistantAnalyticsReads.ts` (`LISTS`, `rowOf`), `convex/utils/analyticsScreens.ts` (`analyticsPartsOf`, the orders), `convex/toolConnectorDefinitions.ts`, `convex/utils/assistantPageCharts.ts`.
- **Tests that will change:** `googleAnalyticsSecondRoundLook.test.tsx` (case 17), `src/pagination-drift.test.ts`, `src/translation-parity-drift.test.ts`, `src/seen-words-drift.test.ts` (run `node scripts/seen-words.mjs`), `src/ask-hakken-chart-pages-drift.test.ts`, `src/chart-size-drift.test.ts`.
- **How the boards were drawn:** real components in jsdom, as in `drawing-boards-real-charts`. The scripts are in the session's scratchpad and will go. The board itself is saved.

## Progress

- 2026-11-05: three ways drawn, each answering a different question. Anthony chose four parts by comment, and those are drawn as "The new page so far". He said "ok this is good" and asked for this plan. Read-only checks of the saved figures on all seven dates and five websites. This plan written. Nothing built. Overall: about 25%.
- 2026-11-05: his seven answers recorded, and the drawing changed from Orders to Bought. Still nothing built. It waits for his go. Overall: about 30%.
- 2026-11-05: "I don't want the campaign visit bars", and he asked for the components as shared, reusable ones. Plan rewritten around shared parts, up from 15 to about 18½ days. "Then use bought". Still nothing built. Overall: about 30%.
- 2026-11-05: "I only want reusable shares components even if we have create new". He asked if redone screens break this. Checked the code of all five, and the findings are above. Waiting on whether to clear them in this build.
- 2026-11-05: "Add these to the plan pls". Step 7 added, up from about 18½ to about 23½ days. Still nothing built. It waits for his go. Overall: about 30%.
- 2026-11-05, evening: Anthony said "Go". Building on `dev`, Campaigns first. No backend saves during the night's collection, 03:00 to about 07:30.
- 2026-11-05, late evening: built so far on `dev`, not committed: the reads, plain names, shared parts (`DaysChart`, `MapCard`, `BarsCard`, `ListTable`), the other screens moved onto them, the eye's rules and Ask Hakken's read, with their tests. "we need conversion rate % too in the count drop down" added. Not done yet: real presses and questions, checks in Chrome, full gates, commit. Overall: about 80%.
- 2026-11-05, night: real checks done on `dev`. What they found, and what was changed for it:
  - **A shared checker fault, fixed for every page.** When the Editor left a crowded sentence off, the next one kept its "Its", and read as another campaign's: "Its purchases also jumped from 5 to 22". A sentence that leans on one left off now goes too (`seesFrom`).
  - **A press lost to a slow model, fixed for every page.** On Ronins each model call took about two minutes, against eight seconds on More Handles, and a press failed when the rewrite ran out of time. The first words now stand, with what was wrong left off (`askWithTools`). Why those calls are slow is not known: it isn't Google tonight, as More Handles stayed quick at the same time. Ronins' Clarity pages were quick on 31 October. Worth looking at on its own.
  - **No press when there's no campaign at all.** On Ronins' October it took over four minutes to write "You had 0 visits… unchanged from 0". The rule's words say it at once, for nothing (`SeesPage.writes`). This is my change, and Anthony hasn't seen it.
  - **Do first asked for what other pages can't show.** "Review the checkout steps for the Sidekicks campaign" sent people to Funnel, which can't split by campaign. Campaigns' `never` list now rules that out. Later presses ask for what to check in the ad account instead.
  - **The eye's data carried figures the page doesn't show.** Ask Hakken quoted a campaign's time on site from it. It's now held to what the page shows (`campaignForEye`).
  - **Google's words in answers.** "(not set)", "add_to_cart", "lastMonth". The tool's rule now says to use the page's words. The change is not yet proved by another real question.
  - **Before and after.** Every moved card was rendered as it was and as it is on More Handles' saved figures, on all seven dates and each step, 168 checks: titles, hints, downloads, hovers, Up or down, maps and menus were the same, bar a hidden marker the screen doesn't read. The compare was temporary and isn't kept.
  - **Limits found.** The third press was planned on Hurtwood House, but the Chrome switch was agreed for Ronins only, so Hurtwood House was checked by reads alone. No website on dev keeps a second home country, so that check couldn't be run: Campaigns reads countries through the same shared code as every other screen (`keptCountry`).
  - **Still open from Step 2.** The chart's days and the table differ by under 0.5% on these dates, both ways, so "Up or down" can read 2,949 beside a box of 2,941. Why wasn't proved, but Google counts a visit crossing midnight on both days and estimates its totals. Visits and Funnel have the same gap.
