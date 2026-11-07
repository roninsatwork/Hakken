# Plan: Google Analytics → Services, for service businesses, with the eye and Ask Hakken

**Written 2026-11-07, after Anthony said of the board "The new page so far": "i think the page is good, can you make this into a plan please - we also need to make sure this page is propertly integratee into ask hakken". Built on dev later the same day: see Progress at the end.**

The drawing is the board "The new page so far · Way 4 with your comments" on the canvas "Hakken — Services, four ways" (https://claude.ai/artifact/X7YPQoRJ9GmTx4fbZDJ1ga). It uses Ronins' real saved figures for the last 12 months. A copy is saved under `docs/plans/assets/services-new-page/`, with the code that drew it, and it is the look built to.

**The eye and Ask Hakken are part of this page, not an extra.** The eye must find things a person would miss, on every date, on Ronins first. Ask Hakken must answer the page's own questions with the page's own figures. Until both do, the page isn't done (steps 6 and 7).

## How long

**About 19 days for a developer. As agent work, about 6 days.**

| Step | What | Days |
|---|---|---:|
| 1 | The reads the page needs | 3 |
| 2 | Which websites get the page, and the menu | 1 |
| 3 | Where the groups split, for any dates | ½ |
| 4 | The page as drawn | 4 |
| 5 | Pressing a service opens its page | ½ |
| 6 | What Hakken sees | 4½ |
| 7 | Ask Hakken on this page | 3 |
| 8 | Checking it all | 2½ |
| | **Total** | **19** |

**How long it really takes.** Live was planned at 15½ developer days and took about 3 hours. Campaigns was planned at 15 and took about 4. At that speed this is about 4 to 5 hours of work.

**Cost.** Nothing new is asked of Google, and there's no new saved list or collection. Every figure comes from lists Hakken already saves each night. I checked on 7 November that all seven dates have them on Ronins. Real checks cost under £1: three presses of the eye on Ronins at about 15p each, and about 40p of questions to Ask Hakken.

## What Anthony chose

| His words, 7 November | Where | What it means |
|---|---|---|
| "a page in the GA section called services", "similar to the product section but aimed at service based businesses and still off GA events" | Chat | The page, off saved Google Analytics events |
| "when we make a chart they need to be interactive so with drop downs so that we can inspect the data" | Chat | Every chart has working menus |
| "i thnk we need to add thi schar to way 4 as teh first compoinetn" | Way 2's month chart | It's the first chart, under the boxes |
| "keep this chart i liek it." | Way 4's dots | The dots stay |
| "this is nice too" | Way 4's map | The map stays |
| "i dotj like this" | How far people get | It's off the page |
| "its too big" | The boxes' numbers | The boxes use the smaller size |
| "we dotn need gthe tabl" | Up or down, under the month chart | It's off the page |
| "the language of the page is awful and i hatge it" | The whole board | Every line rewritten in the redone screens' words |
| "i think the page is good, can you make this into a plan please" | The new board | This plan |
| "Dont call them busy or quiet jsut show the facts in the numbers" | The boxes and the groups | Each group is named by its numbers |
| "Agreed taht a classificaigon issue i would rather we focus on rinisn forst" | Hurtwood House | Built and checked on Ronins first |

**What the signed-off board leaves out from Way 4:** How far people get, and the Up or down table under the month chart. Way 4's other parts are all on it.

## What the page shows, top to bottom

1. **The header.** Services, with "The services people look at, and the ones that get them in touch."
2. **Four boxes**, one for each group of services, each named by its numbers, never busy or quiet. On Ronins over 12 months: "30 visits or more, and 1.6 or more events for every 100" has 12 services, with 739 visits and 31 events. The others are 30 or more and under 1.6, under 30 and 1.6 or more, and under 30 and under 1.6. Each box says how many services, then their visits and events. The numbers use `Figure`'s smaller size (`named`), as he asked. Pressing a box shows just that group on the map and in the table, and pressing it again shows them all.
3. **The month chart**, `DaysChart` on the configurable chart's toolbar. Show: Visits, Events, Events for every 100 visits, Page views. Services: tick any of them, the five busiest to start. Channels: tick any. Lines: One for each service, One for each channel, Just one. Compare with: No comparison, the dates before, Your whole website. No Up or down table under it.
4. **The dots**, `DotGroups` in a `MapCard`. Count: Visits, Visits that started here, Page views. Show: Getting in touch, Staying a while, Scrolling to the bottom. Channels. Visits from: your middle service's visits, half that or twice that. Events from: your whole website's figure, half that or twice that. Changing them moves the boxes and the table too, so they always agree.
5. **The map**, `PageMap` in a `MapCard`. Count, Colour shows, and Show, which picks a group.
6. **The table**, `ListTable`. A search box and a Show chip on one row. Service with its address under it, Visits, Up or down, and Events with its rate under it. Every heading sorts the whole list. Pages of 25, the exact total, and Download CSV.

**Every word on the board is the one to build.** They're copied from the redone screens. The menus are Show, Count, Colour shows and Compare with. The groups are named by their numbers, never busy or quiet (Anthony, 7 November). The map says what Campaigns' map says. A service business says Events, never Bought or Conversions (Anthony, 6 November). No money anywhere.

## Shared parts

| Part | Where it's used today | On this page |
|---|---|---|
| `Figure`, `FigureRow` | Every redone page | The four boxes, with `named` |
| `DaysChart`, toolbar from `ChartExplorer` | Campaigns, Visits, All pages, Funnel, Overview | The month chart, with no `scored` |
| `TickSelect` | Products, a page's own screen | Services and Channels |
| `DotGroups` | In the kit, on no page yet | The dots. This is its first page |
| `MapCard`, `PageMap` | Campaigns, All pages | The dots' card and the map |
| `ListTable`, `TableBar`, `Select` chips | Every redone list | The table |
| `UpOrDownCell`, `FigureCell` | All pages, Campaigns | The table's cells |

**No new parts.** `DotGroups` is in the kit but no page uses it yet, so Anthony won't have seen it on a built screen. If something turns out not to fit while building, it's raised with him first, and built as a shared part (Anthony, 5 November).

## Step 1. The reads the page needs

A new file, `convex/googleAnalyticsServiceReads.ts`. Every read takes the page's dates, device and home country, as every Google Analytics read does.

- **`analyticsServices`**: the boxes, the dots, the map and the table in one answer. It gives each service's visits, page views, stays, scrolls to the bottom and events. It gives the visits with an event, and the visits that started there. Each comes now and for the dates before, and split by channel from the saved landing pages by channel.
- **`analyticsServiceDays`**: the month chart. Each service's days, weeks or months from the saved page series, following the page's step menu. The same by channel from the landing series by channel. The whole website's from the saved totals.
- **What a service is:** a page in a Classification whose type is Service, using the app's one classifying rule (`classifierFor`).
- **One page, one row.** Google lists `/logo-design-agency` and `/logo-design-agency/` apart. The reads add them together. With that done, my figures matched Conversions' exactly: 1,626 visits started on a service page and 50 events.
- **A year of a long list is read a part at a time** (`eachSlotRow`), with only the figures the page needs, so no read runs out of its 64MB.
- **Done when:** tests cover each figure, the dates before, a page with two addresses, a channel picked, and a website with no service pages.

## Step 2. Which websites get the page, and the menu

- **Services shows** in the Figures menu, under Conversions. It shows for a website that isn't a shop (`isShop`) and has service pages. A service page is one in a Classification whose type is Service. A shop keeps Products.
- **On 7 November that gives Services to Ronins and Hurtwood House.** Ronins comes first (Anthony, 7 November). Hurtwood House waits until its Students pages' type is put right in Page classification. NEC's courses are typed Product and it isn't a shop, so NEC gets neither page. Korda and More Handles are shops.
- **A Classification chip** shows when a website has more than one Service-type Classification. Products shows Category the same way, only when a shop has categories. Hurtwood House has two, Life and Students.
- **The address** is `/app/analytics/<website>/services`. A website without service pages that opens it sees a short notice saying why, as Products does for a website that doesn't sell.
- **Done when:** the menu test covers a shop, a service business and a website with neither.

## Step 3. Where the groups split, for any dates

The groups are named by their numbers, never busy or quiet (Anthony, 7 November: "just show the facts in the numbers"). Where they split has to work on any dates. A fixed 40 visits would put every Ronins service under the line on This week, when its service pages had about 13 visits in all.

- **One small file**, `convex/utils/serviceGroups.ts`, shared by the page, the eye and Ask Hakken. All three then put a service in the same group, under the same name.
- **The line across:** the middle service's visits for those dates, rounded to a figure people can say. On Ronins over 12 months that's 30. The Visits from menu offers half and twice that as well.
- **The line up:** the whole website's events for every 100 visits in those dates. On Ronins over 12 months that's 1.6. The Events from menu offers half and twice that.
- **The names come from the lines:** "30 visits or more, and 1.6 or more events for every 100", and so on. They change with the menus, so they always say what's true.
- **Done when:** tests cover every date on Ronins' figures, a service on a line, and the names.

## Step 4. The page as drawn

- `src/app/(dashboard)/app/analytics/[siteId]/services/page.tsx`, built only from the parts above, in the order above. Every chart is full width.
- **The words** go into `messages/en.json` and `messages/it.json`, exactly as on the board, and pass `npm run check:reading`.
- **Dates:** "the dates before" takes each date's own name, as the redone screens do: "the month before", "the 12 months before".
- **The month chart follows the step menu**, as every configurable chart does. That's days for a month, weeks for 3 months and months for a year.
- **Picking a device:** the channel split is only saved for every device. With a device picked, Channels and One for each channel leave the menus, and the chart says so.
- **Ticks and the group you press** live in the address, so a link opens what was showing, and Back returns to it.
- **The approved look** is saved with a look test, so a part added, moved or renamed later fails a test.
- **Done when:** the page matches the board at 1,440 wide, at 3,200 wide, and on a phone, with every chart drawn at its real size.

## Step 5. Pressing a service opens its page

- A row in the table, or a box on the map, opens that page's own Google Analytics screen, as a product opens its page on Products. Back returns to Services as it was.
- **Done when:** a test presses a row and comes back to the same sorting, search and page.

## Step 6. What Hakken sees

Read `docs/developer/what-hakken-sees-guide.md` first, and hold to AGENTS.md: "The eye is the app's USP: it is never weak, empty or broken on any page, for any dates".

**Its own findings, in code** (`convex/utils/sees/own/googleAnalyticsServices.ts`), each compared with something, for whatever dates are chosen. I worked these out from Ronins' saved figures for the last 12 months. They show what the rules must be able to find, and aren't a list for the writer.

- **Where the visits go, and where the events go.** AI Agency gets 36 in every 100 visits to your services, and 22 in every 100 events.
- **A small service that brings people in touch.** ChatBot Agency gets 3 in every 100 visits and 18 in every 100 events, at 10 events for every 100 visits. The website gets 1.6.
- **Fewer visits, more events.** ChatBot Agency fell from 198 visits to 78, but its events went up from 5 to 8.
- **Visits that lead nowhere.** 20 of the 38 services people looked at had no events. Mobile App Developers had 49 visits and none.
- **A service that grew fast.** AI Consultancy went from 9 visits to 143, with 1 event.
- **Which channel brings people who get in touch.** Referral brought 68 visits that started on a service and 7 events. Organic Search brought 1,310 and 29.
- **Events the services don't get.** Your home page got 19 events, so no service gets the credit for those.

**On small dates it still says something true.** On This week Ronins' service pages had about 13 visits and 1 event. The eye says how small that is and compares it with the week before. It never comes back empty.

**What the eye is handed** (`AnalyticsSees`, `useSeesPart`): the boxes and their groups, the month chart's lines as shown, the dots, the map and the table's page, by their measure names. The groups come from step 3's file, so the eye and the page always agree.

**Other changes.**
- **The screen list** (`convex/utils/sees/screenEntries/googleAnalytics.ts`) gets this page and its parts, top to bottom, in plain names.
- **Measures** (`convex/utils/sees/measures.ts`) get any new names, in English and Italian.
- **What it never talks about:** money, Bought, sales or baskets.
- **Links for Do first:** All pages filtered to Service, a service's own page screen, Channels, Funnel and Conversions.
- **The panel** has its three parts: what the figures show, what it means with Do first, then the chat (Anthony, 3 November).

**Tested on every date the menu offers.**
- A new `src/test/fixtures/roninsServices.json`, read with `readFixture`. A second website joins once Hurtwood House's classification is put right.
- On all seven dates, each finds the page's headline and at least four things. On a small date that can't, the test holds it to finding something true, never nothing.
- A test that it never says Bought or sales.

**Three real presses on Ronins,** each read in full, words and run log, about 15p each: Last 12 months, Last month and This week. Ronins' eye calls took about two minutes each on 5 November, so they're timed too. A press thrown away, or a piece that guesses, is fixed in the shared checker (`seesFrom`, `judgeLeftOff`), never page by page.

## Step 7. Ask Hakken on this page

This is what makes the page properly part of Ask Hakken. Today Ask Hakken knows Products but not Services.

- **`read_google_analytics` learns the Services screen.** `services` joins `ANALYTICS_SCREENS` (`convex/utils/analyticsScreens.ts`), and `googleAnalyticsInternal` (`convex/assistantAnalyticsReads.ts`) answers it. It gives the page's own figures by the page's own names: the boxes and groups, the months, the dots, the map and the table, with a link to the page.
- **One service on its own:** asked about a named service, it gives that service's figures, its months and its channels.
- **It reads the same reads as the page**, so its figures always equal the screen's. The groups come from step 3's file.
- **It speaks in Events,** never Bought or sales, and it says how small the figures are when they are.
- **It can draw the page's charts in a conversation.** A new `by: "service"` for its charts (`convex/utils/assistantGroupCharts.ts`, `convex/assistantChartHandlers.ts`), with visits, events, events for every 100 visits and page views. Bars and lines, in the chat, emails and sent tasks. `redraw_page_chart` (`convex/toolConnectorPageCharts.ts`) can redraw any chart on the page.
- **Ask about this page,** at the foot of the eye's panel, starts from this page, as on every other page.
- **Insights can read it too,** through the same tool, as it reads every Google Analytics screen. It fetches nothing.
- **A test with no AI cost that stays in the code:** on all seven dates, Ask Hakken's figures must equal the screen's.

**Real questions, about 40p in all,** on Ronins, last 12 months, each with the answer the figures give.

1. "Which of my services gets the most enquiries?" AI Agency, with 10 events. ChatBot Agency gets the most for its visits, at 10 for every 100.
2. "Which services do people look at but never get in touch about?" 20 of them. Mobile App Developers had 49 visits and Brand Identity Agency 40, with none.
3. "Is AI Agency growing?" Visits went from 548 to 793, and events from 6 to 10.
4. "Where do ChatBot Agency's visitors come from?" Of the 56 visits that started there, 36 came from Organic Search and 12 from Direct.
5. "Which services get plenty of visits but few enquiries?" Seven get 30 visits or more and under 1.6 events for every 100: AI Agency, AI Consultancy, AI Software Development Company, Mobile App Developers, Brand Identity Agency, Webflow Agency and Custom Web Design Agency. It must name them by those numbers, never as busy.
6. "Show my top 5 services' visits each month as lines."
7. "How many enquiries came from my service pages last month?" 2. It must say how few that is, and compare it with the month before.

## Step 8. Checking it all

- **Tests:** the reads, the groups, the menu, the page (on a fixed day, `useScreenDay`), the eye on every date, and Ask Hakken's figures against the screen's.
- **Every read loads on every date** on the dev deployment, checked with `npx convex run … --identity` on Ronins.
- **GitHub's own steps run here first:** `npm run check`, `test:coverage`, `coverage:check`, `test:e2e:smoke` and `build`, the last two in a copy so the app on port 3000 keeps running.
- **Looked at in Anthony's Chrome** on http://hakken.localhost:3000, on Ronins, against the board, with every menu pressed. That needs your Chrome's workspace switched to Ronins.
- **Nothing is committed or pushed** until Anthony asks.

## Limits, said now

- **Ronins is small.** In October its service pages had about 120 visits and 2 events. The page and the eye must say when there's too little to go on.
- **A visit that looks at two services counts once on each.** So services' visits add up to more than the visits that started on them, 2,227 against 1,626 over 12 months.
- **An event counts on the page where it happened.** Ronins' home page got 19 events that no service gets credit for.
- **Phone, email and chat have only been tracked on Ronins since 13 October.** So 45 of its 46 events on service pages are Contact. Form sent is left out, as it counted link clicks before then.
- **A channel picked counts visits that started on the service,** as Google splits only those by channel. The chart says so.
- **Hurtwood House's "Students" pages are typed Service.** They're the student zone, not something it sells, so its Services page would show 78 of them. It waits until that's put right in Page classification.

## Questions for Anthony

Answered on 7 November:
- **The groups' names.** "Dont call them busy or quiet jsut show the facts in the numbers". Done on the board, and in step 3.
- **Hurtwood House.** "Agreed taht a classificaigon issue i would rather we focus on rinisn forst". The build and its checks are on Ronins.

Still open, each with my recommendation. None stops the build.

1. **Where the groups split.** The line across is the middle service's visits for the dates picked, 30 on Ronins over 12 months. *Recommended: keep it, as it works on any dates.*
2. **The month chart's place.** It sits under the boxes, as the boxes come first on every redone page. *Recommended: keep it there.*
3. **The Lines menu.** It's one menu for the whole chart, and its choices now say "One for each service". *Recommended: keep it.*
4. **Pressing a service.** *Recommended: it opens that page's own screen, as step 5 says.*
5. **NEC.** It gets neither Products nor Services. *Recommended: leave it for now.*
6. **Checks and commits.** Under £1 of real checks, then commit to dev without pushing, as before. *Recommended: yes.*
7. **Chrome.** Switching your workspace to Ronins for the checks. *Recommended: yes.*

## For the builder: where things live

- The board and the code that drew it: `docs/plans/assets/services-new-page/New.dc.html` and `board.tsx.txt`. The code shows every figure's sum, every menu and every word.
- The page: `src/app/(dashboard)/app/analytics/[siteId]/services/page.tsx`, beside Products' (`products/page.tsx`), which it follows.
- The menu: `ANALYTICS_PAGES` in `src/app/(dashboard)/app/analytics/_components/useAnalytics.ts`, and `AnalyticsMenu.tsx`.
- Shop or not: `isShop` in `convex/utils/conversionSteps.ts`.
- Classifications: `classifierFor` in `convex/utils/pageClassification.ts`.
- Saved lists: `page`, `landing` and `landingChannel` periods, and the `page` and `landingChannel` page series (`convex/googleAnalyticsSchema.ts`).
- The eye: `convex/utils/sees/` (`screenEntries/googleAnalytics.ts`, `measures.ts`, `own/`), `AnalyticsSees` and `useSeesPart` on the page.
- Ask Hakken: `convex/assistantAnalyticsReads.ts`, `convex/utils/analyticsScreens.ts`, `convex/utils/assistantGroupCharts.ts`, `convex/assistantChartHandlers.ts`, `convex/toolConnectorPageCharts.ts`.

## Progress

- 2026-11-07: four ways drawn, Way 4 picked by comment, the new board signed off ("i think the page is good"). This plan written. Then the groups named by their numbers on the board, and Ronins made the first website.
- 2026-11-07, later: **built**, on Anthony's yes to all ten questions before he went out ("1) yes … 10) yes"). Committed to dev, not pushed.
  - **Steps 1 to 5:** `convex/googleAnalyticsServiceReads.ts` (the page's read, the month chart's read, the menu's check), `convex/utils/serviceGroups.ts` (where the groups split, shared by all three), the page under `src/app/(dashboard)/app/analytics/[siteId]/services/`, and the words in English and Italian. The shared `DaysChart` gained `per`, so a figure for every 100 visits is worked out step by step and never averaged, and `format` for its hover.
  - **Step 6:** `convex/utils/sees/analyticsServices.ts` and `own/googleAnalyticsServices.ts`, with Services' own `never` list. The first real press wrote "conversions", because the shared never-lists say that word, so Services has its own list that says events.
  - **Step 7:** `read_google_analytics` reads `services` (`convex/assistantServiceReads.ts`), with one service's months and channels, and `show_chart` draws `by: "service"` as bars.
  - **Checked:** tests of the reads, the groups, the page and the eye on all seven dates, on Ronins' saved figures (`src/test/fixtures/roninsServices.json`, its address changed to `small-agency.test`). In Anthony's Chrome on Ronins: the boxes match the board, and every chart menu recalculates. Every date's read loads on dev. Three eye presses and seven questions cost $0.50 in all. `npm run check`, `test:coverage`, `coverage:check` and the smoke tests passed. **The build did not:** `next build` type-checks with TypeScript 6 inside Node's 4GB, and it ran out of memory twice in a copy, while the commit before this work built. This work adds about 1% to what it checks (1.73 million types against 1.72 million). Without a 4GB limit, that commit's own check reached over 4GB, so the build was already at its edge. On "Fix it but don't push", the build now type-checks the app without its tests (`tsconfig.build.json`, named in `next.config.ts`), as the deploy's Docker build always has (`.dockerignore` leaves tests out). It passed, its type check in 110 seconds against 2.7 minutes. `npm run typecheck` still checks every file, tests included.
  - **Not done:** "Show my top 5 services' visits each month as lines" drew AI Agency's line alone, as `redraw_page_chart` draws one line at a time. Fixing it means changing that shared tool, so it waits for Anthony. Not looked at 3,200 wide or on a phone. Hurtwood House will see Services, with its Students pages, until their Classification type changes.
  - **Found while building:** Hakken's channel rule moves assistants' visits out of Referral into AI assistants. So "Referral brought 68 visits and 7 events" now reads as AI assistants: 129 visits that started on a service, and 15 events.
