# Plan: the new Channels page, with the eye and Ask Hakken

**Written 2026-11-06 after Anthony chose the parts by comment and said of the board "i think this page is now good". Not built. It waits for his go.**

The drawing is the board "The new page so far" on the canvas "Hakken — Channels, three ways"
(https://claude.ai/artifact/QZbBNycSHCMao1pWejFuAn), on More Handles' real figures for October 2026. A copy is saved under
`docs/plans/assets/channels-new-page/` and is the look built to.

**The eye and Ask Hakken are part of this page, not an extra.** The page isn't done until the eye finds things a person would
miss, on every date, and Ask Hakken answers the page's own questions correctly (steps 8 and 9).

## How long

**About 22½ days for a developer. As agent work, about 7½ days.**

| Step | What | Days |
|---|---|---|
| 1 | The reads the page needs | 3½ |
| 2 | Plain names | 1½ |
| 3 | The four boxes | 1 |
| 4 | Visits each day, with its two tick menus | 2½ |
| 5 | The squares, with their five menus | 3 |
| 6 | How far people got | 1½ |
| 7 | The table | 2 |
| 8 | What Hakken sees on this page | 3 |
| 9 | Ask Hakken on this page | 2 |
| 10 | Checking it all | 3 |
| | **Total** | **22½** |

**Cost.** Nothing more is asked of Google, and no new saved list is needed, so no collection runs. Real checks cost about 80p:
three eye presses at about 15p each, and about 30p of questions to Ask Hakken.

## What Anthony chose

| His comment, 6 November | Where | What it means |
|---|---|---|
| "Can we add a drop-down here which selects the channels - its a multi select" | Today's Visits a day | A Channels tick menu on the first chart |
| "What drop downs can we add here to make this more interactive" | Today's squares | Five menus, all drawn: Channels, Classifications, Split by, Count, Compare with |
| "i dotn this we need this if we approve teh chart above" | Today's How often a visit converts | Those bars come off |
| "i thnk therse heor boxes boxes nebed to be channel related" | Way 1's boxes | Each box names a channel |
| "can we add drop downs for events whihc is also selecaable plae" | The new page's first chart | An Events tick menu beside Channels |
| "can we add this to the page" | Way 2's How far people got | The steps chart goes on |
| "can we add thi stable to the page" | Way 2's table | Way 2's table goes on |
| "i think tyhi spage is npow gopod, re,eber we meed to integrate what ask ahkken sees" | The new page | This plan |

## What the page shows, top to bottom

1. **The header.** Channels, with "Where your visits came from, and where they started on your website."
2. **Four boxes,** each naming a channel.
3. **Visits each day, by channel,** with its Channels and Events menus.
4. **Where each channel's visits started,** the squares, with five menus.
5. **How far people got,** the steps, with a Came from menu.
6. **The search row and the table.**

Today's parts change like this.
- **Off:** today's four boxes, the dots on the daily chart, How often a visit converts, and the Lands most on filter.
- **Kept:** every row opens that channel's own page.

## Shared parts

Anthony, 5 November: "I only want reusable shares components even if we have create new". This page needs no new part. Everything
it shows is a part other screens already use.

| What he chose | What's there today | What it's built as |
|---|---|---|
| The four boxes | `FigureRow` and `Figure` are shared | Used as they are. The rule that picks each channel is plain code, so the page, the eye and Ask Hakken can't disagree |
| Visits each day | `DaysChart` and `TickSelect` are shared, joined through `ExplorerToolbar` | Used as they are, and they replace `ChannelsDailyChart` on this page. `ChannelsChart` stays for the screens still using it |
| The squares | `ConversionsMap` is shared, with `squareOf` already on Campaigns | Used as it is, unless step 5 finds a gap. They replace `ChannelsMap`. `ChannelMap` stays underneath, as it is on Conversions |
| How far people got | `StepFlowChart` is shared, and no page uses it yet. `MapCard` is a card with menus that takes any chart inside it | `StepFlowChart` inside `MapCard`. This is its first page |
| The table | `AnalyticsTable`, on `ListTable` | Its new columns join the shared table, so any list can use them |

**The rules for each.**
- **The page's words and reads stay in a thin page file.** It holds no chart of its own.
- **Screens using a part must look the same afterwards.** Their look tests must pass unchanged. If one can't, I stop and tell him.
- **`ChannelsFigures`, `ChannelsMap` and `ChannelsPerVisit` go** once nothing reads them.

## Step 1. The reads the page needs

Nothing new is collected. I checked this on the dev deployment on 6 November. On More Handles, every read below answered on all
seven dates, with nothing still being collected. A year is held by weeks and months, which `DaysChart` already handles. The list of
channels also answered on Ronins, Korda, NEC and Hurtwood House for this week, last month and a year. The other reads couldn't be
run there, as they only open for the workspace I'm signed in to, so step 10 checks them.

| Part | What it reads today | What it needs |
|---|---|---|
| Boxes | Nothing of this kind | The list of channels, already read. Worked out with one rule |
| First chart | `analyticsChannelChart`: the four busiest and the rest, visits and conversions | Every channel's days, with every key event's times, in one read. Today a channel's events need a read per channel, `analyticsChannelDays`, which would be 12 reads a page |
| Squares | `analyticsChannelsTop`: channel by Classification, visits and conversions, for these dates | The same with bought, and with the dates before. By device, from the list of channels kept per device |
| Steps | Nothing | `analyticsConversionsMap` by channel, already kept in both visits and times, plus stayed from the list |
| Table | `analyticsListPage` | Added to basket, started checkout and bought per row, in visits, with orders on the server over the whole list |

- **The squares get a read of their own,** not more on `analyticsChannelsTop`. Adding the dates before to it would double a read that
  already ran out of its 64MB once on a year (4 November). It keeps reading a part at a time.
- **`perVisit` and `best` come off `analyticsChannelsTop`.** Twelve months of adding up goes with them, so that read gets lighter.
- **`analyticsChannelsTop` goes if nothing else reads it.** Its `figures` and `uncounted` move to where they're still used.
- **Every read run on all seven dates,** timed, staying under Convex's one second and 64MB.
- **Why this page says 35,917 visits and Overview says 35,739.** Answered 6 November: Google estimates visits, and each way of asking gets its own estimate. Anthony chose Google's total for a website's Visits box (`overview-new-page-plan-2026-11-06.md`, step 1). This page's list stays as it is, and its hover says Google counts each list on its own.

## Step 2. Plain names

One small file, like `convex/utils/campaignNames.ts`, used by the boxes, chart, squares, steps, table, eye and Ask Hakken, so they all
say the same thing. English and Italian, in the dictionaries. Google's word stays on hover and in the download.

| Google says | The page says |
|---|---|
| Organic Search | Free search |
| Cross-network | Ads across Google |
| Paid Shopping | Shopping ads |
| Direct | Came straight here |
| Paid Search | Search ads |
| AI assistants | AI assistants |
| Organic Shopping | Free listings |
| Referral | Other websites |
| Paid Social | Social media ads |
| Organic Social | Social media posts |
| Unassigned | Not known |
| Email | Email |
| Display | Banner ads |
| Paid Video | Video ads |
| Organic Video | Free video |
| Paid Other | Other ads |
| anything else | Its name, as Google writes it |

- **They're short on purpose.** The route and step boxes cut a name past 18 letters at a laptop's width.
- **The redone screens that name a channel move onto this file:** Conversions, a page's own screen and its visitors, and Products.
  They must read the same, or the app has two names for one thing.
- **A channel's own page takes the same name in its title.** The rest of that page isn't touched.
- **The address and the saved figures keep Google's name.** Only the words change.

## Step 3. The four boxes

| Box | October on More Handles | Line under it |
|---|---|---|
| Most visits | Free search | 13,169 visits. That's 37% of all your visits. |
| Most bought | Ads across Google | 362 bought. That's 30% of everything bought. |
| Sells best | Search ads | 9.1 bought for every 100 visits. Your website gets 3.4. |
| Biggest change | Ads across Google | 1,917 fewer visits than September. |

- **Rules pick them for whatever dates are chosen.** Most visits and Most bought take the biggest. Biggest change takes the biggest move, up or down.
- **Sells best leaves out channels under 100 visits,** or Email would win with 1 sale from 9 visits.
- **The month's name follows the dates.** On other dates it says "the dates before", with the days on hover.
- **A website with nothing bought** shows Most conversions and Converts best. Ronins, for one.
- **One channel only, or none.** A box with nothing true to say shows a dash, never an empty box.

## Step 4. Visits each day, with its two tick menus

`DaysChart` with two `TickSelect` menus.

- **Channels** opens on the four busiest, like today. Each one ticked gets its own line, and the rest share the grey Everything else line. With every channel ticked, that line goes.
- **Events** opens on None, which counts visits. Tick events and each channel's line counts those instead, adding them up if you tick several. The title follows: Bought each day, by channel.
- **The menu lists the key events that happened in these dates,** the most first, using the website's own names. An event nearly the same as another is left out by the rule Campaigns already has (`chosenActions`), which would take out Checkout complete (question 1). One sent twice under two names shows once. A key event not counted as a conversion says so, as a channel's own page does.
- **Events count times, not visits.** The hint says so, and the hover's column says Times.
- **Nothing ticked in Channels** says "Tick at least one channel", as the kit's charts do.
- **Colours stay with the channel,** whatever else is ticked (Anthony, 20 October). Past the seventh channel, colours repeat. The key and the hover still name each.
- **Ticks live in the address,** so a link opens what was showing.
- **It follows the page's Daily, Weekly or Monthly menu.** The hover names every line, even an empty one.

## Step 5. The squares, with their five menus

`ConversionsMap`, with its toolbar.

| Menu | Choices | What it does |
|---|---|---|
| Channels | Tick any | Which rows show. Opens on every channel |
| Classifications | Tick any | Which columns show. Goes when Split by is Device |
| Split by | Classification, Device | What the columns are |
| Count | Visits, Bought, Bought for every 100 visits, Conversions | What each square leads with |
| Compare with | No comparison, the dates before | The change in each square |

- **Columns.** The busiest named Classifications, Not sorted yet, Other groups and No page recorded, as today. Other groups' hover names what's in it.
- **Brighter** means a bigger share of that channel. On Bought for every 100 visits, it means more than other channels, and a square with under 30 visits doesn't set how bright the others are.
- **The hover** gives that square's visits, bought and conversions, now and before.
- **Pressing a row's name opens that channel's page.**
- **A square never reads over 100 for Bought for every 100 visits by accident.** Conversions can, as one visit can count many times, and the key says so.
- **Not offered:** Country, as no website on dev keeps a second one yet. The real part adds it to Split by the day one does, as Conversions' does.
- **One device chosen at the top of the page.** Where a list isn't kept by device for those dates, the card says it's showing every device, as today.

## Step 6. How far people got

`StepFlowChart` inside `MapCard`, with a Came from menu.

- **Steps:** Arrived, Stayed, In basket, At checkout, Bought. They count visits, so no step can pass 100%.
- **Came from:** Everywhere, or one channel with 100 visits or more.
- **A website with nothing bought** leaves this chart off (question 5). Its other figures aren't steps a visit goes through in order.
- **Search ads on More Handles:** 1,237 arrived, 916 stayed, 279 in basket, 159 at checkout, 112 bought.
- **The words join the dictionaries,** and the chart's own words stay in the part as it's used.

## Step 7. The table

Way 2's table, on `AnalyticsTable`.

- **Columns:** Came from, Visits, Left straight away, Added to basket, Started checkout, Bought.
- **Added to basket and Started checkout** show the visits, with "per 100 visits" under them. They join the shared columns.
- **Bought** is the shared Bought column Campaigns has (question 3).
- **Every heading sorts, over the whole list,** and the download holds what the table shows.
- **The search row:** Find a channel. The Lands most on filter goes, as the squares show it.
- **A row opens that channel's own page.**
- **A website with nothing bought** shows Came from, Visits, Left straight away and Conversions (question 5).

## Step 8. What Hakken sees on this page

Channels has its own rules today (`channelsFindings`). They work from conversions counted as times, and they can't see bought,
the squares or the steps. So they're rewritten. I read `docs/developer/what-hakken-sees-guide.md` first.

**New findings, each compared with something, worked out for whatever dates are chosen.** The rules rank what's biggest, and a bar only
keeps out what's too small to trust. On More Handles for October, they should find things like these. I worked out each from the saved figures.

- **A fall one channel explains.** Ads across Google lost 1,917 visits, and the whole website lost 759. It lost 55 sales, and the website lost 51. All the others together gained 1,158 visits and 4 sales.
- **A rise hiding a fall.** Free search went up 361 visits. Brand pages rose from 885 to 2,035, so the rest of Free search fell.
- **The channel that sells best, and why.** Search ads gets 9.1 for every 100 visits against the website's 3.4. But 91 of its 113 sales started on Brand pages.
- **Big, but sells less.** Free search has 37% of visits and 24% of what's bought.
- **A place people read and don't buy.** 1,770 Free search visits started on the Blog, and 1 bought.
- **Busy, and nobody bought.** Social media ads went up 150 visits to 444, with no sales, and 56% left straight away against the website's 37%.
- **A step far from the rest.** Other websites has the most added to basket, 23 per 100 visits. But only 12% of those started checkout, against the website's 43%.
- **A gap between devices.** Free search sells 2.7 per 100 visits on desktop and 1.4 on mobile.
- **Visits with no page.** 2,193 visits have no page recorded.

Those are examples of what the rules must be able to find, not a list for the writer. The brief stays general ("Never a checklist of findings").

**What the eye is handed.**
- The boxes' figures, the website's own, and every channel, not only the table's page.
- Every channel's days and the same days before, with `useSeesPart`.
- The squares, by Classification and by device, whatever the menus show.
- The steps for every channel.
- **Links for "Do first" steps,** which this page doesn't have today: Campaigns, Funnel, All pages, Conversions and Tracking health.

**Other changes.**
- **The screen list** gets this page's parts, top to bottom, in plain names. What it never talks about stays: money, ad spend and conversions as if they were visits. It must also not talk of what a channel cost, as Hakken doesn't hold that.
- **The panel** has Anthony's three parts: figures, what it means, then the chat.
- **A website with nothing bought** finds in conversions. **A website with few visits** still says something true, and never comes back empty. Ronins had 245 visits in October.
- **The old fixed rules** (`channelsPageSees`) go if nothing else reads them.

**Tested on every date the menu offers,** with a rebuilt fixture (`src/test/fixtures/moreHandlesChannels.json`) holding bought, the squares and the steps. Each date finds the headline and at least four things.

**Three real presses,** each read in full, words and run log, about 15p each: More Handles, Ronins and one more. Any press that's thrown away, or any piece that guesses, is fixed in the shared checker, never page by page.

## Step 9. Ask Hakken on this page

- **`read_google_analytics` for Channels** gives what the page shows, in the page's own names: the four boxes, the first chart, the squares, the steps and the table.
- **Money comes off.** Today's rows still hand over `value`. They don't hold bought at all. Both change.
- **`convertsBest` and `conversionsAVisitByChannel` go,** as those bars are off the page.
- **The order it can read channels in:** most visits, gained most, lost most, most bought, and sells best.
- **One channel on its own,** with its steps, Classifications and devices.
- **It says conversions count times, not visits.**
- **It can redraw any chart on the page** as bars, a pie or a line (`redraw_page_chart`), from what each download holds.
- **A free test that stays in the code.** For all seven dates, Ask Hakken's figures must equal the screen's.

**Real questions, about 30p at most in all.** On More Handles for October, unless it says otherwise.
1. "Which channel brings the most visits?" Free search, 13,169, 37%.
2. "Why did my visits fall?" Ads across Google lost 1,917, and the others together gained 1,158.
3. "Which channel sells best for its visits?" Search ads, 9.1 for every 100, against 3.4.
4. "How far do people from Free search get?" 13,169 arrived, 9,003 stayed, 1,399 in basket, 537 at checkout, 283 bought.
5. "Where do Search ads visitors start?" Brand pages, 769 of 1,237.
6. "Which busy channel sells nothing?" Social media ads, 444 visits.
7. "How does Ads across Google do on mobile and desktop?" 5,018 visits and 191 bought, against 3,543 and 165.
8. "How many times did people add to the basket from Shopping ads?" 2,431.
9. "Why did the old page say 135%?" It must say that counts times, not visits.
10. "Show Free search and Search ads each day as bars."
11. On Ronins for October: "How are my channels doing?" It must speak in conversions, not Bought.

## Step 10. Checking it all

**What recent pages taught me.** Each of these was a fault Anthony found or nearly found.
- **Test what a control means, not that it moved.** "i have 1 item selected on the table and the funnel is full ... don't you test these things". Every menu here gets a test that the figures change to the right ones. That's 5 menus on the squares, 2 on the chart and 1 on the steps.
- **Compare a figure across dates, and with what's saved.** On Funnel, one page read 95% on a year and 72% on six months. Each channel's figures get read side by side on all seven dates.
- **Look at his screen's width.** "why is this so huge on full screen". Every chart gets checked at 3,200 wide and a laptop's.
- **Check against what he asked, not this plan.**

**The list.**
- Tests for the new reads, plain names, the boxes' rule, the sort orders and each menu.
- A new look test for the approved board. Today's look test and its outline for Channels retire (`channelPagesLook.test.tsx`, `docs/plans/assets/ga-channel-pages/look/`). A channel's own page keeps its look test.
- Every read run on all seven dates on More Handles, timed.
- The page's reads on the other websites, in Ask Hakken's read: Ronins, Korda, NEC and Hurtwood House.
- A website with nothing bought, one with few channels and one with none, as screen tests.
- Each device, and a second home country, on one date.
- Conversions, a page's own screen and Products read as they did, with only the channel names changed.
- Checked in Anthony's Chrome, in a tab of my own, against his comments.
- `npm run check` once at the end, then GitHub's own steps in a copy, so the app on port 3000 keeps running. English and Italian kept level.
- **Committed to `dev` once these pass, and not pushed,** if he says the same as last time (question 6). Only this work's files go in the commit, as other things are being changed in this checkout.

## Limits, said now

- **Bought reads slightly differently in two places.** The steps count visits that bought (1,205) and the boxes count what was bought (1,207), as a couple of visits bought twice.
- **Events count times.** Ticking several adds them up, and one visit can count many times.
- **Colours repeat past the seventh channel.** The app has seven line colours.
- **Never what a channel cost.** Hakken holds no ad spend, and that stays outside the product. The page can say what a channel brought, not whether it paid for itself.
- **Not sorted yet is big.** 6,178 October visits start on pages with no Classification. That's a fault in the sorting, not on this page, and the eye can say so.
- **A channel's own page isn't redone here.** It opens from each row and keeps its words like "% of visits", so it still reads over 100%. I'd do it as its own piece once this is in.
- **Overview still uses Google's names.** It's waiting for its own redo.
- **The total visits and Visits from ads are no longer in a box.** I said so on the board.
- **This goes on top of commits not pushed yet.**

## Questions for Anthony

None of these holds up the build. If he says go without answering, I use what I recommend.

1. **The Events menu shows Checkout complete as well as Bought.** They're nearly the same, 1,218 and 1,205, so ticking both counts most sales twice. **I recommend taking it off.** Reply: "take it off" or "keep it".
2. **The plain names in step 2.** You'd see Free search instead of Organic Search. **I recommend these names.** Reply: "yes", or say which to change. **Answered, 6 November:** on the Overview drawing Anthony asked "van we use the proper channel names", and said "yes" to the same names here. So this page uses Google's names. Step 2 goes, and the plain names elsewhere in this plan read as Google's.
3. **Bought in the table.** On Free search it's 284 if it counts what was bought, as on Campaigns and in the boxes, or 283 if it counts visits, as Way 2 drew it. **I recommend 284,** so one name has one number. Reply: "284" or "283".
4. **The page's title.** It stays Channels, the menu's name. Channel is a jargon word, but it's the word you use. **I recommend keeping it.** Reply: "keep it" or the new name.
5. **A website with nothing bought,** like Ronins. The boxes and table use Conversions, and the steps chart comes off, as its other figures aren't steps in order. **I recommend that.** Reply: "yes" or say what you'd want instead.
6. **Spend about 80p on real checks, and commit to `dev` once they pass, without pushing?** **I recommend yes.** Reply: "yes".

## For the builder: where things live

- **The page:** `src/app/(dashboard)/app/analytics/[siteId]/channels/page.tsx`, with its reads and words in a small parts file.
- **Goes:** `ChannelsFigures`, `ChannelsMap`, `ChannelsPerVisit` in `channels/_components/ChannelsParts.tsx`. `ChannelsChart` in `_components/AnalyticsChart.tsx` stays for Events and a channel's sources.
- **Stays:** `channels/channel/page.tsx`, `_components/ChannelParts.tsx`, `ChannelTableCharts.tsx`, `AssistantParts.tsx`, except the channel's name.
- **To copy from:** `_components/CampaignParts.tsx` (`CampaignBoxes`, `CampaignDaysCard`, `CampaignSquaresCard`, `useCampaignNames`), `_components/ConversionExplorer.tsx` (tick menus, colours kept with a channel, what happens with nothing ticked).
- **Shared parts:** `src/ui/components/screens/DaysChart.tsx`, `TickSelect.tsx`, `ChartExplorer.tsx` (`ExplorerToolbar`), `ConversionsMap.tsx`, `StepFlowChart.tsx`, `MapCard.tsx`, `ListTable.tsx`, `Figure.tsx`.
- **The table:** `_components/AnalyticsListScreen.tsx` (`COLUMNS.channel`, `columnOf`, `FIRSTS`) and `_components/AnalyticsCells.tsx` (`ConversionsHereCell`).
- **The reads:** `convex/googleAnalyticsChannelReads.ts` (`readChannelsTop`, `readChannelDays`, `eachLandingByChannel`), `convex/googleAnalyticsChartReads.ts` (`analyticsChannelChart`, `readChannelPoints`), `convex/googleAnalyticsConversionsMap.ts`, `convex/googleAnalyticsReads.ts`, `convex/googleAnalyticsRows.ts`, `convex/utils/campaignActions.ts` (`chosenActions`).
- **The names:** a new `convex/utils/channelNames.ts`, as `convex/utils/campaignNames.ts`. `convex/utils/aiAssistants.ts` keeps its channel keys.
- **The eye:** `docs/developer/what-hakken-sees-guide.md` first. `convex/utils/sees/own/googleAnalytics.ts` (`channelsFindings`; Campaigns' rules are in `own/googleAnalyticsCampaigns.ts`, the one to copy), `screenEntries/googleAnalytics.ts`, `analyticsChannel.ts` (`channelsPageSees`), `googleAnalyticsPeriods.test.ts`, `measures.ts`, `_components/useEyeFigures.ts`, the fixture `src/test/fixtures/moreHandlesChannels.json`.
- **Ask Hakken:** `convex/assistantAnalyticsReads.ts` (`LISTS`, `channelsParts`, `rowOf`), `convex/utils/analyticsScreens.ts`, `convex/toolConnectorDefinitions.ts`, `convex/utils/assistantPageCharts.ts`.
- **Tests that will change:** `channelPagesLook.test.tsx`, `convex/googleAnalyticsChannelReads.test.ts`, `convex/utils/sees/analyticsChannel.test.ts`, `pageData.test.ts`, `pageFindings.test.ts`, `src/pagination-drift.test.ts`, `src/translation-parity-drift.test.ts`, `src/seen-words-drift.test.ts` (run `node scripts/seen-words.mjs`), `src/ask-hakken-chart-pages-drift.test.ts`, `src/chart-size-drift.test.ts`.
- **How the board was drawn:** real parts in jsdom, as in `drawing-boards-real-charts`. The scripts are in the session's scratchpad and will go. The board itself is saved.

## Progress

- 2026-11-06: today's page and three ways drawn, each a different idea. Anthony chose the parts by comment, drawn as "The new page so far". He said "i think this page is now good" and asked for this plan. Read-only checks of the saved figures on all seven dates on More Handles, and the list of channels on the other four websites. This plan written. Nothing built. Overall: about 25%.
- 2026-11-06, the build, on Anthony's go, overnight: everything below is built on the branch and tested on saved figures. Nothing here has been looked at in his Chrome, and no read has run on the dev deployment yet. Overall: about 85%. Build: done. Checks on the real deployment: not started.
  - **Decisions since this plan was written, which won over it.** Step 2 is gone: Google's proper names everywhere, and everything around the name plain. A website with nothing bought says Events and Best for events on this page's figures, and a shop keeps Bought. The whole website's visits are Google's own total, so Everywhere's Arrived reads 35,739 where the board drew 35,917. Biggest change and the best for its visits use `convex/utils/channelPicks.ts`.
  - **Small choices taken, each the plan's recommendation unless it says otherwise.**
    - Question 1: Checkout complete is left out of the Events menu by `chosenActions`.
    - Question 3: Bought in the table counts what was bought, 284 on Organic Search, as Campaigns does. So the table's line says Added to basket and Started checkout count visits, not that everything does. The steps count visits, 283.
    - Question 4: the title stays Channels. Question 5: a website with nothing bought has Events in the boxes and table, and no steps chart.
    - `chosenActions` gained `nearlyFrom`, used here at 50 times: under it, two events the same size are two things, as a small website's 4 forms and 4 calls are. Campaigns doesn't pass it, so it's unchanged.
    - The channel colours are orange, blue, violet, teal, rose, amber and emerald. Slate is left out, as it's Everything else's on the board.
    - A channel with visits before and none now isn't a table row, as the board has none, but the boxes, the eye and Ask Hakken can still name it (`gone` on the list's read).
    - The table has its search box and no filter chip: the plan and the board take Lands most on off, and put nothing in its place.
    - A step the website doesn't send, such as a shop with no `begin_checkout` key event, is left off the steps chart, rather than drawn as nobody getting there.
    - The hint says "Pick a channel", where the board said "Pick a place".
    - With no channel at all, the charts are left off, and the boxes and table say so, as Campaigns does.
    - `analyticsChannelChart` went too, as nothing else read it. Its tests moved to `analyticsChannelsEachDay`.
  - **One thing to weigh once it's on the real deployment.** With Google's own total, the eye says Cross-network lost 1,917 and the whole website lost 1,768, where the plan worked out 759 from the list. Google's September is 37,507 and the list of channels' is 36,677: an 830 gap, more than the "little" the page's hover says. The rule above decides it, so that's what it says.
  - **The fixture.** `src/test/fixtures/moreHandlesChannels.json`'s October is More Handles' own, taken from the agreed board. In the other six periods each channel's visits, conversions and share that left are saved figures of 3-4 November, and what was bought, the steps and the squares are worked out from October's rates, as the deployment wasn't to be read. Replace them with real reads.
  - **Still to do, on the real deployment.** Every read on all seven dates, timed, under a second and 64MB, the squares on a year above all. Three eye presses and the questions in step 9. Looking at it in his Chrome, at 3,200 wide and a laptop's.
- 2026-11-06: built on a branch by a worker, merged into dev with the checks I ran after it. **Checked on the dev deployment and in his Chrome, More Handles, Last month:** the boxes, the steps and the table read as the plan says; the reads load on five of the seven dates in about 1 to 2.5 seconds, which includes the time the command itself takes. The eye's fixture now holds More Handles' real figures on all seven dates, and still finds the plan's examples. One real press read. Three real questions read, and Ask Hakken's figures are held to the screen on all seven dates. **Changed from the worker's build:** a fall is set only against the channel list's own fall (760), never the whole website's total, by step 1's rule. A best channel needs another to beat. **Not checked:** other websites on Channels in Chrome, and the remaining questions on the list.
