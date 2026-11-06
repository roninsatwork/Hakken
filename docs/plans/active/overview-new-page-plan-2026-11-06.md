# Plan: the new Overview page, for shops and service businesses, with the eye and Ask Hakken

**Written 2026-11-06, after Anthony chose the parts by comment and said "i think this is good, can you make a plan and also add to that plan to update What Hakken Sees for this page across product and service". Not built. It waits for his go.**

The drawings are two boards on the canvas's Overview page (https://claude.ai/artifact/QZbBNycSHCMao1pWejFuAn):

- **The new page so far:** a shop, on More Handles' real figures for October 2026.
- **For a service business:** on Hurtwood House's real figures for October 2026.

Two more screens joined this plan on 6 November, on the canvas's pages Tracking health and Connection (steps 14 to 17).

Copies are saved under `docs/plans/assets/overview-new-page/` and are the look built to. The new parts as drawn are there too, in `overviewparts.tsx.txt`.

**The eye and Ask Hakken are part of this page, not an extra.** The page isn't done until the eye finds things a person would miss, on every date, on both kinds of website, and Ask Hakken answers the page's own questions correctly (steps 11 and 12).

## How long

**About 46 days for a developer. As agent work, about 15 days.** Overview is 30½ of that, and Tracking health and Connection are about 15.

| Step | What | Days |
|---|---|---:|
| 1 | Visits that don't add up | 1 |
| 2 | Find out what changed on 3 September | 1 |
| 3 | The reads the page needs | 3½ |
| 4 | Shop or service, sorting events, and the word Events | 3 |
| 5 | The four boxes | 1 |
| 6 | Visits each day | 1½ |
| 7 | The squares, on a new shared `HundredGrid` | 4 |
| 8 | The bands, on a new shared `HundredStrips` | 3½ |
| 9 | Top pages | 1 |
| 10 | The rest of the page goes | ½ |
| 11 | What Hakken sees, for shops and service businesses | 4½ |
| 12 | Ask Hakken on this page | 2½ |
| 13 | Checking it all | 4 |
| 14 | Tracking health, Way 1 | 3½ |
| 15 | A check's own screen | 1½ |
| 16 | Connection, Way 3 | 6½ |
| 17 | Both pages: menus and eye off, and checks | 3¾ |
| | **Total** | **45¾** |

**How long it really takes.** Live was planned at 15½ developer days and took about 3 hours from his go to checked. Campaigns was planned at 15 and took about 4. At that speed this whole plan is about 10 to 12 hours of work, and Tracking health and Connection alone are about 3 to 4.

**Cost.** No new saved list and no new collection. One small ask of Google to check September's saved total in step 1, a handful of tokens, after reading the allowance left. Real checks cost about £1: four eye presses at about 15p each, and about 40p of questions to Ask Hakken. Tracking health and Connection spend nothing on AI, as they have no eye and no Ask Hakken. Testing Connection's Change button reads a website's events from Google once, about 5 small asks, after reading the allowance left.

## What Anthony chose

| His comment, 6 November | Where | What it means |
|---|---|---|
| "ok i like way3 - but i want to make changes to it" | Way 3 | Way 3 is the starting point |
| "add this component to way 3 as the first item" | Way 2's Visits each day | That chart comes first |
| "do wee need this once we move the chart from teh other screen" | Way 3's weekly chart | It's not on the screen he signed off |
| "this is lovely what opens can we add to makeit more interactive" | The squares | Five menus, and pressing to keep a row lit |
| "this is absioluteoy lovelty - what options can we add to mak ethis more interactuve" | The bands | A Compare with menu, and pressing to keep a channel lit |
| "we need hero boxes on the way 3 too. - but the contetns need a rethink" | Way 1's boxes | Four rethought boxes |
| "van we use the proper channel names" | Free search on Way 3 | Google's names, like Organic Search and Cross-network |
| "we can fix this, add this to the plan" | Visits that don't add up | Step 1 |
| "This words really well for ecommerce, how woudl it work well for a servuce based busienss" | The new page | The service board |
| "we preobable tneed to add a table of pages thats sortanle with top pags by visits neing at teh top" | The new page | Top pages |
| "we need hero boxes on the servive version too", "we need this table on the servive page tpp", "the visits per day graph" | The service board | Both kinds of website get the whole page |
| "i think this is good, can you make a plan and also add to that plan to update What Hakken Sees for this page across product and service" | Both boards | This plan |
| "events" | Conversions or Enquiries on a service business | A service business says Events |

## What the page shows, top to bottom

| | A shop | A service business |
|---|---|---|
| 1. The header | Overview | Overview |
| 2. The boxes | Visits, Bought, Biggest change, Sells best | Visits, Events, Biggest change, Best for events |
| 3. Visits each day | Show holds the website's figures, with Added to basket and Bought | The same, with the website's own events |
| 4. The squares | Out of every 100 visits | Out of every 1,000 visits, or 100 events |
| 5. The bands | Who visits, and who buys | Who visits, and who gets in touch |
| 6. Top pages | With Bought | With Events |

Every part keeps the page's own Country, Device, Dates and Daily menus.

**Off the page:** today's eight boxes, Where visits came from, Pages by classification, Where visits landed, Conversions, Who visited, Shop and Tracking health. Each has its own page, and the eye still reads them. People and Tracking health aren't on the signed-off boards, so they no longer show on Overview at all.

## Shared parts

Anthony, 5 November: "I only want reusable shares components even if we have create new". On this page, 6 November: "you can make new componetns , but they have to be built as multi use shared compintens".

| What he chose | What's there today | What it's built as |
|---|---|---|
| The boxes | `FigureRow` and `Figure` are shared | Used as they are. The rule that picks each one is plain code, so the page, the eye and Ask Hakken can't disagree |
| Visits each day | `DaysChart` is shared | Used as it is. It replaces `VisitsChart` on this page. `VisitsChart` stays for a page's own screen |
| The squares | Nothing fits | **New: `HundredGrid`.** Any split of any figure, out of 100 or 1,000, with its key beside it. Inside `MapCard` |
| The bands | Nothing fits | **New: `HundredStrips`.** Two rows of 100, joined by bands. Any figure against any other. Inside `MapCard` |
| The whole numbers | Nothing fits | **New: `outOfTotal`,** plain code that shares out whole squares so they always add up. The parts, the eye and Ask Hakken all use it |
| Top pages | `AnalyticsTable` on `ListTable` | Used as it is, with its columns set for this page |
| Tracking health and Connection | `Figure`, `Notice`, `ListTable`, `Select`, `Checkbox`, `Meter`, `StatusLabel`, `TagLabel`, `CompactList`, `SiteFacts` are shared | All used as they are. **No new parts** |

**The rules for each.**
- **A new part goes in `src/ui/components/screens/`, the drawing kit and `screen-kit.md`.** It takes plain figures and words, and reads nothing itself, so any section can use it.
- **They're drawn in real pixels,** so they don't grow on a wide screen (`chart-size-drift`). The grid keeps its size, and the bands get wider cells but keep their height.
- **On a phone,** the key goes under the grid, the list under the bands goes to one column, and the 1,000 grid turns to 25 across so it fits.
- **The squares fill in once, and their colours fade when a menu changes.** Both go with reduced motion (`useReducedMotion`).
- **Screens already using a shared part must look the same afterwards.** Their look tests must pass unchanged. If one can't, I stop and tell him.

## Step 1. Visits that don't add up

Anthony, 6 November, on this fault: "we can fix this, add this to the plan". Then, asked which number the box should show: "Google's total".

**So the Visits box stays as it is today:** Google's own total for the dates. It matches Google's own screen. On More Handles that's 35,739 for October, 4.7% fewer than September. Nothing changes on any other screen's box.

**Why the numbers differ.** Google doesn't count every visit one by one. It estimates them, and says so on its own developer blog (https://developers.google.com/analytics/blog/2023/bigquery-vs-ui). It adds up page views, so those are exact. Each way of asking gets its own estimate.

| More Handles' visits, October and September | October | September | Fall |
|---|---:|---:|---:|
| Google's total, in the box | 35,739 | 37,507 | 4.7% |
| The days added up | 35,909 | 36,534 | 1.7% |
| The channels added up | 35,917 | 36,677 | 2.1% |
| The Classifications added up | 35,877 | 36,443 | 1.6% |
| The devices added up | 35,877 | 37,240 | 3.7% |
| New and returning added up | 35,923 | 36,914 | 2.7% |

**What's left to do.**
1. **Check September's saved total once.** Its gap, at 831 visits, is bigger than I'd expect. Ask Google for September's visits once with no split, and compare it with what's saved. Read the allowance first. If it's different, I stop and tell him.
2. **Say so where a list can't match.** A chart or table of channels, Classifications, pages or days can add up to a little more or less than the box. Its hover says Google counts each list on its own.
3. **Never set one against the other.** The page, the eye and Ask Hakken never subtract a list's total from the box's, or call the gap a change. A list's own figures are compared with that same list in the dates before.
4. **A new drift test.** It fails if a screen's whole-website visits come from anything but Google's total.

**What it means on the page.** The squares use Google's total too, so they stay as drawn, with Left straight away at 38 against 34. The bands are shares, so they read the same either way. The chart's days are each their own figure, and the channels' figures stay as Channels shows them.

## Step 2. Find out what changed on 3 September

On More Handles, page views fell from about 80,000 a week to about 35,000 around 3 September. Engaged visits fell from about 93 in every 100 to about 62. Visits and sales didn't move. It looks like a change in the tracking.

- **It matters for this page.** 1 and 2 September sit in September's figures. From 3 September, worked out per day, page views are down about 3%, not 8.9%, and Left straight away is about 1 point better, not 3.5 worse.
- **What I'd do.** Look at what changed on the website's tracking that week, with the Tracking health checks beside it. I'd tell him what I find before changing anything.
- **Whatever the cause,** the eye gets a rule for a figure that stepped and stayed (step 11). No website needs this fixing for the rest of the page to work.
- **He said yes,** 6 November.

## Step 3. The reads the page needs

Nothing new is collected. I checked this on the dev deployment on 6 November. On More Handles, every read below answered on all seven dates, with nothing still being collected, and both units of each event held. The internal read also answered on Ronins, Korda, NEC and Hurtwood House for this week, last month and 12 months.

| Part | What it reads today | What it needs |
|---|---|---|
| Boxes | `analyticsOverview`, and the list of channels | Nothing new. One rule picks the boxes |
| Visits each day | `analyticsChart`, `analyticsPeriodBeforeChart` | `length` on each point of both, and `views` on the dates before. The dates-before read holds no days past 90 days, so Last 3, 6 and 12 months have no second line. The hint says so, as on Visits and Funnel |
| The squares | Nothing | A new read, `analyticsOverviewSteps`, giving each step for the whole website, each channel, each Classification and each device, now and before |
| The bands | Nothing | A new read, `analyticsOverviewShares`, giving each row of each split, with its figures and each event, now and before |
| Top pages | `analyticsListPage`, `list: "landing"`, `leaveOut: true` | Nothing new. It sorts with `visits`, `change`, `bounce`, `bought` and `conversions`, over the whole list |

- **Both new reads are built on lists already saved** (`columnSums` and the conversions map, and each list's own rows). Each read part at a time, as a long list read whole can run a query out of its 64MB.
- **New or returning has every step.** The map doesn't offer it as a column, but each row of the list holds it. I first told Anthony it didn't, and I was wrong.
- **A Classification's September figure for Stayed.** The drawing shows a dash. Each page's engaged visits are saved for the dates before, so the read can add them up, and the dash goes.
- **Every read run on all seven dates,** timed, under Convex's one second and 64MB.

## Step 4. Shop or service, sorting events, and the word Events

**A shop or not.** One rule in one small file: the connection says it's a shop, or something was bought in these dates or those before. Campaigns has the second half today and moves onto the file, so a website doesn't flip between the two with the dates. Today More Handles is the only shop. Ronins, Korda, NEC and Hurtwood House aren't.

**100 squares or 1,000.** Under 2 in every 100 visits doing the thing that counts, over the last 12 months, the squares go out of 1,000. It uses 12 months, so the title doesn't change with the dates.

| Website | For every 100 visits, 12 months | Squares |
|---|---:|---|
| More Handles | 2.9 bought | 100 |
| NEC | 2.8 conversions | 100 |
| Ronins | 1.6 conversions | 1,000 |
| Hurtwood House | 1.2 conversions | 1,000 |
| Korda | 0.3 conversions | 1,000 |

**A first step or the real thing.** A service business has no basket or checkout, so its steps come from its own conversions.
- **A plain rule on the event's name, in one small file.** A click, a chat, a phone number or an email address is a first step. A form, a booking, a signup or a contact is the real thing.
- **Checked against all five websites' events.** On NEC, Chat Opened and Chat Shown are first steps, and Chat Offline Message Sent and contact are real. On Korda, Newsletter_Signup and form_submit are real, so there's no first-step row.
- **Auto Setup can overrule it** when it next runs, and it writes a plain name for each (below). Nobody has to set anything.
- **A website with nothing sorted** shows one row, Got in touch.

**The word Events.** Anthony, 6 November: "events". A website that doesn't sell says Events on Overview, Funnel and Campaigns, so one figure has one name there. That's half a day of this step, and those two screens must otherwise look the same. A shop keeps Bought. The menu's page stays Conversions.

**Plain names for events.** The board says Asked for a prospectus. Today the app would say Form submit prospectus form (`useEventName`). So Auto Setup gets one more small job: an everyday name for each counted event, saved in English, with the Translator doing the rest. It runs only when Auto Setup is pressed, and no schedule is added. Until then, the name stays as today's.

## Step 5. The four boxes

| Box | A shop, More Handles | A service business, Hurtwood House |
|---|---|---|
| How many came? | **Visits** 35,739, 4.7% fewer than September | **Visits** 6,878, 13.5% fewer than September |
| What came of it? | **Bought** 1,207. 3.4 for every 100 visits, the same as September, with 51 fewer sales | **Events** 108. 1.6 for every 100 visits. It was 2.7 in September, with 110 fewer events |
| What moved most? | **Biggest change** Cross-network, 1,917 fewer visits | **Biggest change** Paid Search, 877 fewer visits |
| Where should I look? | **Sells best** Paid Search, 9.1 for every 100 visits. Your website gets 3.4 | **Best for events** Paid Search, 2.2 for every 100 visits. Your website gets 1.6 |

- **Each opens the page behind it.** Visits to Visits. Bought to Products. Events to Conversions. A named channel to its own Channels page.
- **Rules pick them for whatever dates are chosen.** Sells best and Best for events leave out channels under 100 visits.
- **Biggest change and Sells best are also planned for Channels.** So the rule is one shared piece of code. Anthony chose to keep Sells best on my advice, 6 November.
- **The month's name follows the dates.** On other dates it says "the dates before", with the days on hover.
- **Nothing true to say** shows a dash, never an empty box.

## Step 6. Visits each day

`DaysChart`, with Show and Compare with.

- **Show, on a shop:** Visits, Page views, Pages a visit, Visit length, Stayed, Left straight away, Times added to basket, Times started checkout, Bought, Bought for every 100 visits and Conversions.
- **Show, on a service business:** the same first six, then Conversions, Conversions for every 100 visits, and its four busiest conversions.
- **The title follows.** Page views each day, Booked a visit, each day.
- **Visit length uses `length`,** as the boxes do. The first drawing used `seconds`, which is only engaged time, and read about 100 seconds where the real figure is about 270. I've fixed the boards.
- **People isn't on it,** as people can't be added up across days.
- **It follows the page's Daily, Weekly or Monthly menu.** The hover names every line, even an empty one.
- **Show and Compare with stay in the address,** so a link opens what was showing.

## Step 7. The squares

`HundredGrid` inside `MapCard`.

| Menu | Choices | What it does |
|---|---|---|
| Came from | Everywhere, or a channel with 100 visits or more | Whose visits |
| Started on | Every Classification, or one | Whose visits |
| Device | Every device, or one | Whose visits |
| Out of every 100 (a shop) | Visits, Visits that stayed, Visits that added to a basket, Visits that started checkout | What the squares are out of |
| Show (a service business) | How visits ended, How people got in touch | Steps, or kinds of conversion |
| Compare with | September, Your whole website, No comparison | The right-hand column |

- **Choose one of the three "whose" menus at a time.** Hakken doesn't hold those figures combined, so choosing one sets the others back.
- **A shop's rows:** Left straight away, Looked around, then left, Added to basket, then left, Started checkout, then left, and Bought.
- **A service business's rows:** Left straight away, Looked around, then left, Clicked to get in touch, and Sent a form.
- **How people got in touch** is out of 100 conversions. On Hurtwood House, 31 clicked Apply now, 23 asked for a prospectus, 18 sent the contact form and 17 booked a visit.
- **Rolling over a square lights its row, and the other way round.** Pressing keeps it lit, and pressing again lets go.
- **The hover** gives that row's visits and exact share, now and against the comparison.
- **Only a few visits.** Under 100, the line under the title says it's only a rough guide.
- **The page's Device menu at the top narrows everything.** The squares' own Device menu then shows that device and can't be changed. Where a list isn't kept by device for those dates, the card says it's showing every device.
- **It counts visits, so a visit doing two things counts in both.** So the squares are close rather than exact, and the plan's limits say so.

## Step 8. The bands

`HundredStrips` inside `MapCard`.

| Menu | Choices on a shop | Choices on a service business |
|---|---|---|
| Split by | Where from, Classification, Device, New or returning | The same |
| Compare with | Bought, Added to basket, Started checkout, Conversions, Page views, Visits in September | Events, its four busiest events, Page views, Visits in September |

- **The top row is always visits.** The line under the title says it plainly: "The top row is where 100 visits came from. The bottom row is the same for 100 sales." Anthony asked what the two scores meant, so these words matter.
- **Every channel is in the list under the chart,** with its two figures. A channel's name shows on the chart only where it fits. Numbers show down to 2 cells wide.
- **The six busiest keep a colour each.** The rest share grey, so it doesn't turn into a rainbow, and the list names each one. A channel keeps its colour whatever Compare with says.
- **Classification** shows the 8 busiest, Not sorted yet and Other groups, as the conversions map does. Other groups' hover names what's in it.
- **Pressing a channel keeps it lit** while the menus change, so one channel can be followed through them all. Pressing again lets go.
- **Only a few on the bottom row.** Under 100, the line under the title says it's only a rough guide. Hurtwood House had 18 booked visits.
- **Not offered:** Page views and Visits in September by Classification on the service board, as the read I used to draw it didn't hold them. The new read does, so they join the menu.

## Step 9. Top pages

`AnalyticsTable` with `list: "landing"` and `leaveOut: true`.

- **Columns:** Page, Visits, Up or down, Left straight away, and Bought or Events.
- **It opens with the most visits at the top.** Every heading sorts, over the whole list, by the shared rule for which way comes first.
- **Visits means visits that started on the page,** as on Funnel.
- **It leaves out search, basket and account pages,** as Funnel does.
- **No page recorded stays in the list,** so those visits aren't hidden.
- **The search row:** Find a page, and the Classification menu. **A row opens that page's own screen.**
- **The numbered footer and the download** are the shared table's own.

## Step 10. The rest of the page goes

- **Off this page:** `AnalyticsFigures`, `VisitsChart`, `AnalyticsPanel` and `CompactList`. All stay in the app, as other screens use them.
- **`analyticsOverviewPanels` goes from the page.** Ask Hakken moves off it in step 12, and then it goes if nothing else reads it. `analyticsOverviewPagePanels` stays, as Funnel reads it.
- **The old look** retires: `docs/plans/assets/ga-overview/look/Overview.txt`, and case 2 of `googleAnalyticsLook.test.tsx`.

## Step 11. What Hakken sees, for shops and service businesses

Read `docs/developer/what-hakken-sees-guide.md` first, and hold to AGENTS.md: "The eye is the app's USP: it is never weak, empty or broken on any page, for any dates".

Overview has its own rules today (`overviewFindings`). They work from conversions counted as times, and can't see bought, the squares, the bands or the first and real steps. So they're rewritten, in two halves that share one file.

**New findings, each compared with something, worked out for whatever dates are chosen.** The rules rank what's biggest, and a bar only keeps out what's too small to trust. I worked out each example below from the saved figures for October. They show what the rules must be able to find. They aren't a list for the writer ("Never a checklist of findings").

**On a shop, More Handles.**
- **A fall one channel explains.** Cross-network lost 1,917 visits and 55 sales. All the others together gained 1,158 visits and 4 sales.
- **Fewer visits, but just as many buy.** 3.4 for every 100 visits, both months.
- **Who brings the people who buy.** Paid Search is 3 of every 100 visits and 9 of every 100 sales. Organic Search is 37 and 24.
- **Who comes back to buy.** Returning visitors are 26 of every 100 visits and 43 of every 100 sales. They buy 5.4 for every 100 visits, against 2.8 for new visitors.
- **A gap at one step.** Phones add to a basket less, at 12 for every 100 visits against 16 on desktop. But once they've added, more of them buy, at 26 in 100 against 23.
- **Busy, and nobody buys.** The Blog is 6 of every 100 visits, with 3 sales from 2,088 visits.
- **One page moving against the rest.** Black door handles went from 5 visits to 225, with nothing bought.
- **One day far from the rest.** On 9 October, Started checkout happened 830 times. A usual day is about 170.

**On a service business, Hurtwood House.**
- **Fewer conversions than the fall in visits explains.** Visits fell 13.5%, and conversions halved, from 218 to 108.
- **A fall one channel explains.** Paid Search lost 877 of the 1,075 visits lost.
- **Which kind of conversion fell.** Booked a visit went from 52 to 18, and Apply now from 76 to 34.
- **Pages that bring visits, and pages that bring enquiries.** News is 18 of every 100 visits and 1 of every 100 conversions. Admissions is 6 and 13.
- **Where one kind starts.** 12 of the 18 booked visits started on Admissions.
- **A page that got busy and led nowhere.** One news story went from 29 visits to 866, with no conversions.
- **A gap between devices.** Mobile is 68 of every 100 visits and 47 of every 100 conversions. Desktop is 30 and 52.
- **The same forms counting twice.** Asked for a prospectus happened 25 times in 12 visits. The eye treats that as a question about the tracking, never as interest doubling.

**On both.**
- **A figure that stepped and stayed.** Page views fell by more than half in early September and stayed there, with visits flat. On any dates that cross it, the eye says the two sides aren't alike, rather than calling it a fall.
- **Visits with no page.** 2,191 on More Handles.

**What the eye is handed.**
- The boxes, the website's own figures, and each channel, not only the table's page.
- The days, and the same days before, with `useSeesPart`.
- The squares for every channel, Classification and device, and the bands for every split.
- Top pages, and the Tracking health checks, though the panel's gone.
- Whether it's a shop, and its first and real steps.
- **Links for Do first:** Channels, Funnel, All pages, Conversions, Visits and Tracking health, and Products on a shop.

**Other changes.**
- **The screen list** (`screenEntries/googleAnalytics.ts`) gets this page's parts, top to bottom, in plain names, one version for each kind of website.
- **What it never talks about:** money, conversions as if they were visits (`CONVERSIONS_AS_TIMES`), and Search Console's clicks. **On a service business,** it never says sales, bought or basket. **On a shop,** it leads with bought and not conversions.
- **A first step isn't an enquiry.** A click on Apply now is never called an application.
- **The writer** gets told which kind of website it's writing for. The guide's other rules stand: figures first, then what it means, then Do first, with at most two figures a sentence.
- **Measures** (`measures.ts`) get the new names, in English and Italian.
- **The panel** has Anthony's three parts: figures, what it means, then the chat.
- **A small website** still says something true, and never comes back empty. Ronins had 245 visits in October, and 35 this week.

**Tested on every date the menu offers.**
- `src/test/fixtures/moreHandlesOverview.json` is rebuilt to hold the new parts.
- A new `hurtwoodHouseOverview.json` holds the same for a service business, read through `readFixture`.
- `googleAnalyticsPeriods.test.ts` runs both on all seven dates. Each finds the headline and at least four things.
- A Ronins fixture for one small website: it must still find something true.
- A test that a service business's findings never say Bought, and a shop's lead with it.

**Four real presses,** each read in full, words and run log, about 15p each: More Handles on Last month, More Handles on a long date, Hurtwood House, and Ronins. A press thrown away, or a piece that guesses, is fixed in the shared checker (`seesFrom`, `judgeLeftOff`), never page by page. The other websites need that workspace chosen, so I'd ask him when I get there. I'd keep each as an eval page, for the words to be graded against his notes.

## Step 12. Ask Hakken on this page

- **`read_google_analytics` for Overview** gives what the page shows, in the page's own names: the boxes, the days, the squares for anyone asked about, the bands and Top pages.
- **Money comes off.** Today's read still hands over `value` and `valueChange`.
- **It says which kind of website it is,** and speaks in bought or conversions to match.
- **It says conversions count times, and the squares count visits.**
- **It can redraw any chart on the page** (`redraw_page_chart`), from what each download holds.
- **A free test that stays in the code.** For all seven dates, Ask Hakken's figures must equal the screen's.

**Real questions, about 40p at most in all.** On October.

More Handles:
1. "Why did my visits fall?" Cross-network lost 1,917, and the others together gained 1,158.
2. "How many visits bought something?" 1,205, about 3 in every 100.
3. "Out of every 100 that added to a basket, how many bought?" 24.
4. "Who brings the people who buy?" Paid Search, at 3 of every 100 visits and 9 of every 100 sales.
5. "Do returning visitors buy more?" Yes, 5.4 for every 100 visits against 2.8.
6. "Which page gets the most visits?" The home page, with 4,049.
7. "Show page views each day as bars."

Hurtwood House:
8. "Why did my conversions fall?" From 218 to 108, with Booked a visit from 52 to 18.
9. "Which pages bring visits but no enquiries?" News, at 18 of every 100 visits and 1 of every 100 conversions.
10. "How do people get in touch?" 31 clicked Apply now, 23 asked for a prospectus, 18 sent the contact form and 17 booked a visit, out of every 100.

Ronins:
11. "How's my website doing?" It must speak in conversions, never Bought, and say how small the figures are.

## Step 13. Checking it all

**What recent pages taught me.** Each of these was a fault Anthony found or nearly found.
- **Test what a control means, not that it moved.** Every menu gets a test that the figures change to the right ones. That's 2 on the chart, 5 on the squares and 2 on the bands.
- **Compare a figure across dates, and with what's saved.** Each figure read side by side on all seven dates.
- **Look at his screen's width.** Every chart checked at 3,200 wide and a laptop's.
- **Check against what he asked, not this plan.**

**The list.**
- Tests for the new reads, the rules for the boxes, shop or service, 100 or 1,000, and first or real steps.
- Tests for `HundredGrid`, `HundredStrips` and `outOfTotal`: they always add up, on any figures, including all nought and one row.
- A new look test for each approved board.
- Every read run on all seven dates on More Handles, timed.
- The page's reads on Ronins, Korda, NEC and Hurtwood House, in Ask Hakken's read.
- A website with nothing counted, one with one channel, and one with no visits, as screen tests.
- Each device, and a second home country, on one date.
- Checked in Anthony's Chrome, in a tab of my own, against his comments.
- `npm run check` once at the end, then GitHub's own steps in a copy, so the app on port 3000 keeps running. English and Italian kept level.
- **Committed to `dev` once these pass, and not pushed,** as he said on 6 November. Only this work's files go in the commit, as other things are being changed in this checkout.

## Step 14. Tracking health, Way 1

Anthony, 6 November: "i need to redo two more screens in this plan too", then "these are the user client facing front end screens that we need better wording on and maybe an upgraded layout". The board is The new page so far on the canvas's Tracking health page, saved as `HealthNew.dc.html`. It's Way 1, with his answers on it. He said "this is my preferred version with changes" with Way 1 on his screen, then that his comments had already said which version he wants.

**Words first.** Every line is on the board, and the words are in `docs/plans/assets/overview-new-page/healthconnection.tsx.txt`. They follow the screens redone with him, never say Hakken, and pass `npm run check:drawing`. The old lines come off `scripts/reading-age-allowlist.json` as they go.

- **A new name for each of the 13 checks** that reads properly beside any result. "Sudden drops" works beside All good or Not right. Today's "Every conversion happens" sits beside "Needs a look".
- **The word is Events,** for a shop and a service business alike. He said "these are really events". The menu's page stays Conversions, as step 4 says, so "What it affects" still names it.
- **Bounce rate says Left straight away,** as the redone screens do.

**Three results, not two.** All good, Not right, and No effect. No effect means it found something, but your figures are still right. A plain rule per check: Visits from other websites, and Events with no value.

**Four boxes, one for each kind of figure.** Visits, Where visitors came from, Events and Pages. Each says how far you can trust it, such as 94 in 100 or 7 of 13. Pressing a box filters the table to that figure's checks, through the page's address, and pressing again clears it. The box is `Figure` with `href`, as it is.

**One line above them,** in `Notice`, says how things stand. A rule picks it. All good says so, a day with no visits says that first, and otherwise it's "Most of your figures are right. 3 things are a bit out, and they're first in the list."

**The table moves onto `ListTable`,** with its search box and two chips on one row, Result and Changes. It holds Check, Result, What it found and What it affects. Not right comes first. Long lists go, so one row is never 7 lines tall. A row opens its own screen.

**A 14th check, Events counted twice** (he said yes). It reads `copies` on the connection, which already knows. Two events both ticked and matching day for day is Not right, and it says to stop counting one on the Connection page. It goes in `HEALTH_CHECKS` and `CHECK_ORDER`, with no new ask of Google.

**Gone.** The line saying Hakken's team was told in the bell, as that's not for a client.

## Step 15. A check's own screen

The board is `CheckNew.dc.html`. He said "this is my preferred version with changes".

- **It finally says what to do.** Today the table says "click a check for what to do", and this screen never says. `useHealthWords` writes `why` and `fix`, and nothing shows them. Now it has What it found, Why it matters, What it affects and How it gets fixed, as plain rows.
- **Show, Empty or All.** He asked "can we have show all and empty". The table of events opens on Empty, the 6 that haven't happened, and All shows all 13. It's a chip on the search row. A check that names addresses or pages keeps its own table.
- **The button says Choose your events.** He said "wtf is this language" about Change what counts. It goes to the Connection page.
- **Each check says where it's fixed,** in Google Analytics or on the website. A check Hakken can't fix says so once, with no to-do list.

## Step 16. Connection, Way 3

He said "this is my preferred version". The board is The new page so far, saved as `ConnectionNew.dc.html`.

**Five plain sentences, under one status line.** "Connected and working since 16 October", then how often figures come, when they last came, how far back they go, which account it uses, and what's counted and left out. It says "covered by your subscription", never free. He said "i dont want to use the word free in a paid for app". A rule writes each sentence from the saved connection.

**One table, with the ticks in it.** Your events, on `ListTable`, with `Checkbox` in the first column, then Event, Kind, Last 30 days with a `Meter`, Value each and Worth knowing. Google's name goes on the name's hover. Most common first, within each kind. The board is The new page so far, saved as `ConnectionNew.dc.html`.

**The Change button stays, and the Change screen goes.** He said "change is good" when asked how Hakken should look for new events. So pressing Change on the table asks Google for new events (`changeWhatCounts`, as today, about 5 small asks), then turns the ticks and value boxes on where they are, with Save and Cancel under the tables. `ChooseWhatCounts` and `?change=1` go. No schedule is added. A viewer sees it all with no Change button. I've read his words this way and told him so.

**A value box in each row** (he said yes). Value each is a small `Field` while changing, as Insights can still use a value. An event with a value from Google Analytics shows it, with no box. No warnings. The steps for setting it in Google Analytics go.

**Your addresses, a second table.** The ticks that say an address counts, like NEC's store.nec.ac.uk, move here from the Change screen, along with why each one is what it is (`whereWhy`). He chose this: "Yes, under it".

**Kind is one rule.** Sales, On the way to buying, Getting in touch, and Not happening. It sits in step 4's file, beside first step or real thing, so there's one rule for sorting events. A service website has no shopping kinds.

**Worth knowing says what only the Change screen says today.** The same form under two names, an event that isn't an enquiry, and not once in 90 days. These notes already exist (`copyOf`, `sameAs`, `isReally`, `neverTicked`, `notKeyEvent`).

**The other states.** Drawn on `ConnectionConnect.dc.html` (before it's connected, after a cancelled sign-in), `ConnectionChoose.dc.html` (choosing the property) and `ConnectionFirst.dc.html` (choosing your events the first time). They use the same parts and the same plain words. A problem notice and a viewer's page aren't drawn, as they follow from these.

**Disconnect stays,** with its yes or no pop-up. It says Search Console stays connected, and you keep all your figures so far.

## Step 17. Both pages: menus and eye off, and checks

- **The Country, Device, Dates and Daily menus go** from both pages and a check's own screen, as they do nothing there. `AnalyticsFilters` in `[siteId]/layout.tsx`, which already has `OWN_DAYS` naming them.
- **The eye goes** from Tracking health and a check's own screen. He agreed to that on 3 November. The copies from his Chrome still show it in the top bar, and I don't know why yet. Find out first.
- **No eye and no Ask Hakken here,** by his rule on settings pages.
- **Free comes off Usage too** ("i gave you text of what to use"). `usage.about.sees` ends "shows the same advice, covered by your subscription". `usage.comingUp.figures.free` needs other words, as it's the credits not booked yet, not something at no charge. I've proposed "Spare in {month}".
- **Tests.** Look tests for all three screens, for each result and each state. `check:reading` and `check:drawing`. Italian words to match. A wide screen and a laptop.
- **In his Chrome,** signed in, on More Handles and one website that doesn't sell, pressing every box, chip and tick. Save with nothing changed, as saving a real change alters past months.
- **Read back against what he asked:** better wording, reading age 14, a layout that says if it's working.

**Found while drawing. Not in these steps unless he says.**

- **Conversions on More Handles are mostly baskets.** Added to basket counts as a conversion, 17,199 times in 30 days, about 2 in every 3. Sales were 1,186. The new table shows this, and he can untick it there.
- **Checkout complete (1,197) and Purchase (1,186) look like the same thing.** That's only a guess.
- **Addresses count visits in every country** (`siteAddresses`), while other pages count only the UK. So the 43,534 on an addresses table won't match. It would need one more small ask each week to show the UK only.
- **Google lists 8,354 visits with no address at all** in the last 30 days. I don't know what that means yet.
- **Insights can still use a value** (`insights.sources.unlocks.enquiryValue`), though no Google Analytics page shows one. I'd told him no screen does, and that was wrong. The boards now say no Google Analytics page.

## Limits, said now

- **Visits won't add up exactly.** The box is Google's total, and its lists each add up to a little more or less. On More Handles, 35,739 against 35,917 by channel. Their hovers say so.
- **The squares are close rather than exact.** A visit doing two things counts in both, and a visit can come back to an old basket.
- **Whole squares can't show 3.4.** It shows as 3, and the hover has the exact figure.
- **Colours repeat past the sixth channel.** The list names each one.
- **Hakken doesn't hold figures combined,** like Paid Search on mobile. So the squares' three "whose" menus work one at a time.
- **Only the four busiest conversions** are on the bands' Compare with and Show. On Hurtwood House that leaves out the email and phone clicks, with 11 between them. The rule says it's up to four.
- **Last 3, 6 and 12 months have no September-style line on the chart,** as the days before aren't held. The boxes and tables still compare.
- **Never what a channel cost.** Hakken holds no ad spend.
- **Plain names for a website's conversions** wait for Auto Setup's next run on that website.
- **This goes on top of commits not pushed yet.** Live and Campaigns aren't pushed.

## Questions for Anthony

**None are left.** Building waits for his go.

**Answered, later on 6 November.**

- **Your addresses:** he said "i dont understand" the first time, so I explained it with NEC's store as the example. Then "Yes, under it". A second table under Your events.
- **Which list opens Tracking health:** "u have said on the screen which version i want in comments". Way 1.
- **Setting a value:** "yes". A box in each row.
- **Looking for new events:** "change is good". A Change button, read as above.
- **A 14th check for events counted twice:** "yes". Half a day, in step 14.
- **Free on Usage:** "i gave you text of what to use in the canvas". Covered by your subscription, except where free means spare. A quarter of a day, in step 17.

**Answered, 6 November.**

- **Which number the Visits box shows:** "Google's total". See step 1.
- **The word on a service business:** "events". A service business says Events, and the service board does. The steps below still say conversions in places for a service business, and read as Events.
- **Funnel and Campaigns say Events too:** "yes". Added to step 4.
- **Find out what changed on 3 September:** "yes". Step 2 stands.
- **Why Hurtwood House's forms count about twice:** "no - use ronins". So that's not looked into. Ronins' forms don't count twice: 5 times in 5 visits in October, and 68 times in 63 visits over the year.
- **Redrawing the service board on Ronins:** "i dont need it re drawm". Hurtwood House's board stays, and checks run on both.
- **Google's channel names on Channels too:** "yes". Noted in the Channels plan.
- **The fourth box:** "i will go with y9yu". Sells best stays.
- **About £1 on real checks, and commit to `dev` without pushing:** "yes".
- **Switching his Chrome to the Hurtwood House and Ronins workspaces for the checks:** "yes".

**Not questions after all.** The weekly chart, People and Tracking health aren't on the screens he signed off. I shouldn't have asked about them. They're off, and that's settled.

## For the builder: where things live

- **The page:** `src/app/(dashboard)/app/analytics/[siteId]/page.tsx`, with its reads and words in a small parts file. It holds no chart of its own.
- **New shared parts:** `src/ui/components/screens/HundredGrid.tsx`, `HundredStrips.tsx`. As drawn: `docs/plans/assets/overview-new-page/overviewparts.tsx.txt`. Add to `scripts/drawing-kit/parts.tsx` and `docs/developer/screen-kit.md`.
- **Parts used as they are:** `Figure.tsx`, `DaysChart.tsx`, `MapCard.tsx`, `ChartExplorer.tsx` (`ExplorerToolbar`), `ListTable.tsx`, `_components/AnalyticsListScreen.tsx`, `AnalyticsCells.tsx`, `useReducedMotion`, `useElementWidth`.
- **New plain code:** `convex/utils/outOfTotal.ts`, `convex/utils/conversionSteps.ts` (first step or real, and the rule for 100 or 1,000), and shared rules for the boxes and for shop or service.
- **The reads:** `convex/googleAnalyticsReads.ts` (`figuresOf`, `readOverview`, `analyticsOverview`, `readListPage`), `convex/googleAnalyticsChartReads.ts` (`readChart`, `readPeriodBeforeChart`), `convex/googleAnalyticsConversionsMap.ts` (`columnSums`, `foldKinds`), `convex/googleAnalyticsOverviewReads.ts`, `convex/googleAnalyticsLists.ts`, `convex/googleAnalyticsListKinds.ts` (`LIST_SORTS`).
- **Names:** Google's, as the saved lists hold them. `useEventName` for conversions, with Auto Setup's plain names added to it.
- **Auto Setup:** `docs/plans/active/auto-setup-plan.md`.
- **The eye:** `docs/developer/what-hakken-sees-guide.md` first. `convex/utils/sees/own/googleAnalytics.ts` (`overviewFindings`, line 235; Campaigns' rules in `own/googleAnalyticsCampaigns.ts` are the ones to copy), `screenEntries/googleAnalytics.ts`, `measures.ts`, `googleAnalyticsPeriods.test.ts`, `pageData.test.ts`, `_components/AnalyticsSees.tsx`, `useEyeFigures.ts`, the fixture `src/test/fixtures/moreHandlesOverview.json`.
- **Ask Hakken:** `convex/assistantAnalyticsReads.ts` (`case "overview"`, `overviewPanelParts`, `overviewPageParts`), `convex/utils/analyticsScreens.ts` (`analyticsPartsOf`), `convex/toolConnectorDefinitions.ts`, `convex/utils/assistantPageCharts.ts`.
- **Tests that will change:** `googleAnalyticsLook.test.tsx`, `src/test/googleAnalyticsFixtures.ts`, `convex/googleAnalyticsOverviewReads.test.ts`, `src/translation-parity-drift.test.ts`, `src/seen-words-drift.test.ts` (run `node scripts/seen-words.mjs`), `src/ask-hakken-chart-pages-drift.test.ts`, `src/chart-size-drift.test.ts`.
- **Tracking health:** `[siteId]/tracking-health/page.tsx`, `tracking-health/check/page.tsx`, `_components/useHealthWords.ts`, `messages/en.json` and `it.json` (`googleAnalytics.health`), `convex/googleAnalyticsHealth.ts` (`inCheckOrder` in `convex/utils/sees/analytics.ts`).
- **Connection:** `[siteId]/connection/page.tsx`, `messages` (`googleAnalytics.connection`, `googleAnalytics.counts`), `convex/googleAnalyticsConnect.ts` (`saveWhatCounts`, `changeWhatCounts`, `readWhatCounts`).
- **The words and boards for both:** `docs/plans/assets/overview-new-page/healthconnection.tsx.txt`, `Health1.dc.html`, `CheckNew.dc.html`, `ConnectionNew.dc.html`.
- **How the boards were drawn:** real parts in jsdom, as in `drawing-boards-real-charts`. The scripts are in the session's scratchpad and will go. The boards are saved.

## Progress

- 2026-11-06: today's page and three ways drawn. Anthony chose Way 3 and marked it up by comment, on a new board. Then he asked how it would work for a service business, and that's drawn on Hurtwood House's real figures, as the whole page. He said "i think this is good" and asked for this plan. Read-only checks of the saved figures on all seven dates on More Handles, and on the other four websites. Two faults of mine fixed on the boards: Visit length used the wrong figure, and New or returning had steps I'd said it didn't. Nothing built. Overall: about 25%.
- 2026-11-06: his answers recorded under Questions. The service board now says Events. He said "not yet" on building. Overall: about 25%.
- 2026-11-06: more answers recorded. "Place" changed to "channel" everywhere on the boards, the notes and this plan, as the app calls it. One question left. He wants two more screens added to this plan.
- 2026-11-06: he chose "Google's total" for the Visits box, so step 1 shrinks to a check, the hovers and a drift test. No questions left. Not built, and waiting for his two more screens.
- 2026-11-06: Tracking health and Connection drawn on the canvas, today and three ways each, waiting for his choice. Not costed yet, not built. Google's total recorded in step 1. Overall: about 25%. These two screens: about 20%.
- 2026-11-06: he said "ok add these to the plan and ask any questions". Tracking health and Connection are now steps 14 to 17, about 14½ days. Six questions asked. Not built. Overall: about 25%. These two screens: about 25%.
- 2026-11-06: his answers recorded, and drawn on both The new page so far boards: Way 1 with a 14th check, and Way 3 with a Change button, value boxes and Your addresses. One question left. About 46 developer days in all. Not built. Overall: about 25%. These two screens: about 30%.
- 2026-11-06: "Yes, under it", so no questions are left. Connection's other states drawn. He asked how many man days and whether it could be done during a nap: about 46 developer days, about 10 to 12 hours of real work, so not all of it. Waiting for his go. Overall: about 25%. These two screens: about 30%.
- 2026-11-06, the build, on his "Yes, build it all". **Built and committed to dev, not pushed:** Tracking health, a check's own screen, Connection, and Overview for shops and service businesses, with the eye and Ask Hakken. Reads: one `analyticsOverviewSplit` with a `split` argument, in place of the two this plan named. `overviewFigures` is what the eye and Ask Hakken both read, so they can't differ from the page. `analyticsOverviewPanels` is gone, as nothing reads it.
  - **Step 1:** September's saved total checked once against Google with `readSpanVisits`: 37,507 both. So the gaps are Google counting each list on its own, and not a fault in what's saved.
  - **Step 2, 3 September on More Handles:** pages a visit went from about 10 to about 4 in one day, and visits that stayed from 94 in 100 to about 63, with visits and sales flat. That's what a change in how the website records page views looks like. Nothing was changed on the website. The eye says the days either side can't be compared.
  - **The eye:** rules in `own/googleAnalyticsOverview.ts`, tested on all seven dates on More Handles, Hurtwood House and Ronins. Four real presses, read in full. The first kept one sentence of five, which led to two fixes in the shared checker: a sentence carrying a finding not yet said stands past the figure limit, and checks that leave under three sentences send it back once more (`THIN_BUBBLE`). A screen can now say which figures matter first (`figuresFirst`).
  - **Ask Hakken:** `assistantOverviewReads.ts`, held to the screen on all seven dates. Eleven real questions asked and read, all right. "How's my website doing?" answers from the older summary read, in conversions, never Bought, as the plan asked.
  - **Plain names:** Auto Setup names each counted event when pressed, and can overrule first step or real thing. The Translator does the rest. No schedule added. **No website has been named yet:** it needs Auto Setup pressed, so Hurtwood House still says Form submit prospectus form.
  - **His finds during the build, fixed:** the squares and bands flickered as the pointer crossed the gaps between cells; words ran out of the boxes on a narrow window; the section's menu left too narrow a column under 1,280 wide, so it now sits above the page. Also found on Ronins: a "best" channel at 0.5 where the website got 2.0, so a best channel now needs another to beat.
  - **Checked before the push:** `lint:all`, `npm run check` (9,241 tests), coverage and its check, the 19 smoke tests and the build, all passing. Pushed to dev the same day, on his word. Not on main.
