# Plan: the new Live page, with the eye and Ask Hakken

**Written 2026-11-06 after Anthony said "WAY 3 WITH MODIFICAIOGTNSI SHWAT I WANT" and asked for this plan. Not built. It waits for his go.**

The drawing is the board "The new page so far" on the Live page of the canvas "Hakken — Channels and Live"
(https://claude.ai/artifact/QZbBNycSHCMao1pWejFuAn), on More Handles' real figures at 10:15 on 6 November 2026. A copy is saved under
`docs/plans/assets/live-new-page/` and is the look built to.

**The eye and Ask Hakken are part of this page, not an extra.** The page isn't done until the eye finds things a person would
miss, at busy and quiet moments, and Ask Hakken answers the page's own questions correctly (steps 7 and 8).

## How long

**About 15½ days for a developer. As agent work, about 5 days.** Saving people and views by the hour would add 2½ days (question 1).

| Step | What | Days |
|---|---|---|
| 1 | The reads the page needs | 2½ |
| 2 | The live dot and the top of the page | 1 |
| 3 | People each minute | 1½ |
| 4 | The last half hour against usual | 2 |
| 5 | What people are looking at | 1 |
| 6 | The table | 1½ |
| 7 | What Hakken sees on this page | 2½ |
| 8 | Ask Hakken on this page | 1½ |
| 9 | Checking it all | 2½ |
| | **Total** | **15½** |

**Cost.**
- **Real checks,** about 80p: three eye presses at about 15p each, and about 30p of questions to Ask Hakken.
- **Google.** The page asks nothing more than it does today: about 8 small reports a minute, only while it's open and in front. Testing means having it open, about 30 minutes in all, so about 240 reports. I read the allowance first and keep a fifth in hand.
- **Convex.** The new index in step 1 takes a little more room on each website's saved pages. Nothing else new is saved, unless question 1 says otherwise.

## What Anthony chose

| His comment, 6 November | Where | What it means |
|---|---|---|
| "its a but dry and dull at the momnent, can we have a look to pep it up" | Today's page | Three different ways, drawn |
| "i think i liek way 3 so lets keep this ad the page" and "WAY 3 WITH MODIFICAIOGTNSI SHWAT I WANT" | Way 3 | Way 3 is the page |
| "can we add this to the chosen page as the first compintent" | Way 1's People each minute | The bars come first, under the boxes |
| "an we make tpage longer amnd show thew URL" | The table | The Page column takes the room and shows the address |
| "are you following the langage styl eon the page" | The chart's title | No sentence in a chart's title. The verdict goes in the line under it |
| "You can create new compontejnts but if you do they have to be new schared compintes we can re-use elsewhere" | New parts | Three new shared parts, below |
| "can we fic these" | Faults I'd found | Three fixes, already on `dev`, below |

## What the page shows, top to bottom

1. **The header.** Live, with "Who is on your website right now, and what they did in the last 30 minutes."
2. **The update line.** A pulsing dot, then "Updates every minute while this page is open. Next update in 39 seconds."
3. **Four boxes:** On the website now, Busiest page, Busiest town, Newest conversion.
4. **People each minute,** a bar for each minute.
5. **The last half hour against usual,** bars with a mark for what's usual.
6. **What people are looking at,** the map by Classification.
7. **The search row and the table,** switching between Pages, Places, Devices and Events.

Today's parts change like this.
- **Off:** the two long sentences at the top, the curved line, and the Countries and Towns charts (question 2).
- **Kept:** the Paused notice and Carry on button, the words for when the page is behind another tab, the Google-can't-answer notice, the Every device menu, and the table's four lists.

## Already done, on `dev` and not committed

Anthony asked for these on 6 November ("can we fic these"). They go in first, in their own commit.

- **The Events list works.** Google won't split people by event in its live figures, and asking for that failed the whole minute. It now asks for times only, and the table has no People column for events. Proved on the real page. Ask Hakken tells an event in times. The pretend Google in the tests now refuses what the real one refuses.
- **Conversions have a usual for this hour.** `analyticsLiveUsual` takes the moment and works out a usual half hour at this hour on this day of the week, from the `eventHour` list already saved. On a Friday at 10am on More Handles that's 23.4, against the even spread's 18.3. The eye uses it now.
- **Each conversion is kept with its minute** (`happened`), from what Google already sends. This page doesn't draw it, so it comes back out unless he wants it (question 3).

## Shared parts

Anthony, 6 November: new parts are fine "if ... they have to be new schared compintes we can re-use elsewhere". Each takes plain figures and reads nothing.

| What he chose | What's there today | What it's built as |
|---|---|---|
| The four boxes | `FigureRow` and `Figure` are shared, and `Figure` has a place for a mark | Used as they are |
| The pulsing dot | Nothing | **New: `LiveDot`.** Anywhere a figure is live |
| People each minute | `SiteLineChart`, a curved line | **New: `MinuteBars`.** One bar for each step, the newest lit and pulsing, a figure on each bar. For any short run of recent figures |
| The last half hour against usual | Nothing | **New: `AgainstBars`.** A bar for now and a mark for what's usual, each row on its own scale. For any figure against a usual or a target |
| The map | `MapCard` and `SiteTreemap`, as on Visits | Used as they are |
| The table | `ListTable` and `PageLink`, as on Products | Used as they are |

**The rules for each.**
- **Each new part goes in** `src/ui/components/screens/`, the drawing kit (`scripts/drawing-kit/parts.tsx`) and `docs/developer/screen-kit.md`, with tests of its own.
- **Drawn in real pixels,** so words and bars keep their size at 3,200 wide (`src/chart-size-drift.test.ts`).
- **Motion stops for anyone who asks for less** (`prefers-reduced-motion`).
- **Not built:** `LiveFeed` and `CountDots`. They were on Ways 1 and 2, and aren't on this page. Each would be its own piece if he wants it.
- **`TopBars` and `SiteLineChart` stay** for the other screens using them.

## Step 1. The reads the page needs

Nothing new is collected, and nothing more is asked of Google.

| Part | What it reads today | What it needs |
|---|---|---|
| Boxes, bars, chart | `askGoogleAnalyticsRealtime` | Nothing more |
| Usual | `analyticsLiveUsual` | Nothing more for the chart |
| Map and table | Page titles from Google, and nothing else | A new read: for the titles Google gives, each page's address and Classification |
| The eye's comparisons | Last month's share of views by page | Last month's share of views by Classification (`analyticsPageKindViews`, as Visits' map) and of people by device. All saved figures |

- **Title to page.** Google's live figures only give a title, and Hakken keeps titles by page (`holdPages`). Going the other way needs a new index on title, not a read of every saved page, which can be thousands on one website. It reads only this website's pages, and adds nothing to collect.
- **The read runs at most once a minute,** when Google's answer comes, with one look-up for each title and no cap. More Handles had 56 titles. A test with 500 holds it under Convex's one second.
- **What it found on the drawing.** Of 56 titles, 43 have an address. For the map, 41 match a saved page, 10 go in the Search and basket box by their name (search, basket, account and order pages), and 5 aren't saved under that title, so they sit in Not sorted yet.
- **A title on two pages.** The busiest of them gets it. A title can change, so this is a guide, and it's said under Limits.
- **Busiest page says Home page** when its address is the home page, as `homePage` already does. Otherwise its title, cut to two lines, whole on hover.

## Step 2. The live dot and the top of the page

- **`LiveDot`,** before the update line and the On the website now box.
- **The update line** counts down on the page's own clock, as `liveTiming.ts` already asks once a minute. Behind another tab, it says today's words. Paused, today's notice and Carry on.
- **Today's two long sentences move to a rollover** on the update line, using the kit's `Tooltip`, so they can still be read on a phone. What they say stays true: every country, the whole Google Analytics property, pages by title, can't say where visitors came from, and nothing kept.
- **Four boxes:**

| Box | At 10:15 on More Handles | Line under it |
|---|---|---|
| On the website now | 9 | In the last 5 minutes. |
| Busiest page | Home page | 4 people and 11 views. |
| Busiest town | London | 5 of 26 people. |
| Newest conversion | Added to basket | 1 minute ago. |

- **Nobody here.** The first box says 0, and the others say what they can from the last half hour. **Nothing in the last half hour:** Busiest page and Busiest town show a dash, and Newest conversion says none in the last 30 minutes, as today.
- **A town Google can't name** says Not known, and isn't picked as busiest while another has as many.

## Step 3. People each minute

`MinuteBars` in the kit's chart card.

- **One bar for each minute,** the newest lit at the right, with its dot pulsing. Figures on the bars, as Anthony asks of charts.
- **A new bar comes in every minute** and the rest slide along. It never jumps or redraws the whole chart.
- **Hover:** the minute and its people.
- **Words:** "The last 30 minutes. The newest is on the right, and a new bar comes in every minute."
- **Download** as today.

## Step 4. The last half hour against usual

`AgainstBars` in the kit's chart card.

| Row | At 10:15 on More Handles | Against |
|---|---|---|
| People | 26 | About 21 in a usual half hour |
| Views | 92 | About 103 in a usual half hour |
| Conversions | 15 | About 18 in a usual half hour |
| Conversions at this time | 15 | About 23 in a half hour, on a Friday at 10am in October |

- **Title:** The last half hour against usual.
- **The line under it says the verdict,** worked out by a rule: "More people than usual, but fewer conversions. The bars are the last half hour, and the white marks are what's usual."
- **The verdict uses conversions at this time** where the hours are kept. People and views have only the even spread, unless question 1 says otherwise.
- **The month's name and the day and hour follow the moment.**
- **A small website.** Ronins had 245 visits in October, under one for each half hour. A usual under one says "Fewer than 1 in a usual half hour". Under 5, the verdict isn't said, as one person would swing it. The bars stay.
- **No usual yet,** on a website just connected. The card says so and shows the last half hour alone.
- **A device chosen.** The usual follows that device. Where it has none kept yet, it uses every device and says so.
- **A website counting no conversions** has no Conversions rows.
- **The hover** gives both figures and says what the usual is.
- **The arrow and the word carry the meaning,** not the colour, as Anthony can't tell red from green.

## Step 5. What people are looking at

`MapCard` with `SiteTreemap`, as Visits' map.

- **Each Classification is a box,** bigger and brighter for more views in the last 30 minutes. That's the 92 on the drawing.
- **The hover** gives its views, its share of views and how many pages.
- **Small boxes and the words under the map** work as on Visits. Pressing a box opens nothing, as on Visits.
- **Search and basket is a new box, not a Classification.** Those pages have no saved title to match, so the page sorts them by name.
- **A website with nothing sorted** says so in place of the map, as Visits does. **Nobody here:** a line in place of the map.

## Step 6. The table

`ListTable`, with today's four lists.

- **Pages:** `PageLink` with the title over its address. The Page column takes all the room, and People and Views are as wide as their headings.
- **A row with an address opens that page's own screen,** which today's table can't do.
- **No address:** the title, with "No address saved" under it, and it opens nothing.
- **Places, Devices and Events** stay as they are. Events shows times alone (done).
- **The line in the bar:** "In the last 30 minutes. One person can be on several pages." The people add up to more than the people here, so the line says why.
- **Every heading sorts, over the whole list, as today,** in pages of 25, 50, 75 or 100. The download holds what the table shows, with the address added for Pages.

## Step 7. What Hakken sees on this page

Live has its own rules today (`liveFindings`): people, views and conversions against usual, and one page far above its share. They were written before these parts were on the page, so they get more. I read `docs/developer/what-hakken-sees-guide.md` first.

**New findings, each compared with something, worked out each minute.** The rules rank what's biggest, and a bar only keeps out what's too small to trust. At 10:15 on More Handles, they should find things like these.
- **Conversions at this time.** 15, against about 23 on a Friday at 10am. That's a truer picture than the even spread's 18.
- **More people, fewer looks.** 26 people against about 21, but 92 views against about 103.
- **A page above its share.** The home page has 12% of views now, against 6.3% last month. This rule exists, and moves from people to views, so it compares like with like. Its bar comes down too: today's asks for 15 points more, so it would miss this one. The biggest is picked, and a bar only keeps out too few views.
- **A Classification far from its share,** against last month's.
- **A device far from usual.** 7 of 26 people are on a phone, 27%, where phones had about half of October's visits.
- **A burst.** The busiest minute of the half hour, against the half hour's average.

Those are examples of what the rules must be able to find, not a list for the writer. The brief stays general.

**What the eye is handed.**
- The page's figures, the boxes, the chart's minutes, the usuals and the map's boxes, with `useSeesPart`.
- The Pages list with addresses, whichever list the table shows.
- **Links for "Do first" steps,** which this page doesn't have today: Conversions, Funnel, All pages and Tracking health.

**Other changes.**
- **The screen list** gets this page's parts, top to bottom. What it never talks about stays: money, why it's busy or quiet, and a usual half hour as an exact count.
- **The panel** has its usual three parts: figures first, then what it means and Do first, then Ask about this page.
- **Nobody here** still says something true and useful, and never comes back empty.
- **`liveSees` goes** if nothing else reads it.

**Tested on moments, not dates,** as Live has no date menu: busy, quiet, nobody here, and the real 10:15 moment, added to the fixture (`src/test/fixtures/moreHandlesLive.json`). Each finds at least what its figures can support, and never a guess.

**Three real presses,** each read in full, words and run log, about 15p each: More Handles twice, at a busy and a quiet moment, and Ronins. Any press that's thrown away, or any piece that guesses, is fixed in the shared checker, never page by page.

## Step 8. Ask Hakken on this page

Its read is `googleAnalyticsLiveInternal`. **It asks Google each time it's called,** so it stays one call a question.

- **It gives what the page shows,** in the page's own words: the four boxes, the minutes, the usuals with what each one means, the map's boxes and the table's list with addresses.
- **It says live figures can't name where visitors came from,** and won't guess why it's busy.
- **It can redraw any chart on the page** as bars, a pie or a line (`redraw_page_chart`), from what each download holds.
- **A free test that stays in the code.** For a fixed answer from the pretend Google, Ask Hakken's figures must equal the screen's.

**Real questions, about 30p at most in all.** Figures move, so each is checked against the page at that minute.
1. "How many people are on the website right now?" The same as the first box, about the same minute.
2. "Is it busier than usual?" It must use the usual and say people and views are spread evenly over night and day.
3. "How are conversions doing for this time of the week?" It must use conversions at this time.
4. "Which page are most people on?" The title and its address.
5. "Where are people right now?" Towns and countries.
6. "What did people do in the last half hour?" Events in times, never people.
7. "Why is it quiet?" It must say the figures can't tell it why.
8. "Where did these visitors come from?" It must say live figures can't say, and point to Channels.
9. "Show people each minute as a line."
10. On Ronins: "Is anyone on my website?" It must be right when nobody is, and say so plainly.

## Step 9. Checking it all

**What recent pages taught me.** Each of these was a fault Anthony found or nearly found.
- **Test what a control means, not that it moved.** "i have 1 item selected on the table and the funnel is full ... don't you test these things". Every list, the device menu and the new minute get a test that the figures change to the right ones.
- **Look at his screen's width.** "why is this so huge on full screen". Every chart gets checked at 3,200 wide and a laptop's.
- **Check against what he asked, not this plan.**
- **Check the real thing.** The Events list passed its tests and failed on the real Google, because the pretend one was too kind. So every list on the page gets checked once on the real page. The pretend one now refuses what the real one refuses.

**The list.**
- Tests for the title read, the usuals, the verdict's rule, the boxes' rules and each new part.
- A new look test for the approved board. Today's look test and its outline retire (`googleAnalyticsSecondRoundLook.test.tsx` case 14, `docs/plans/assets/google-analytics/look/Live.txt`). The test that Live offers no country stays.
- The page's reads on More Handles at a busy and a quiet moment, timed.
- Ronins checked in Chrome. Korda, NEC and Hurtwood House through Ask Hakken's read, one question each.
- A website with nothing bought, one with nobody here, one with no usual yet and one with no town named, as screen tests.
- Each device, on one moment.
- Behind another tab, paused, and Google refusing: it asks nothing, and says so. `liveTiming.ts`'s tests stay as they are.
- With reduced motion on, nothing moves.
- Checked in Anthony's Chrome, in a tab of my own, against his comments.
- `npm run check` once at the end, then GitHub's own steps in a copy, so the app on port 3000 keeps running. English and Italian kept level.
- **Committed to `dev` once these pass, and not pushed,** if he says the same as last time (question 5). Only this work's files go in the commit, as other things are being changed in this checkout.

## Limits, said now

- **A usual half hour for people and views is an even spread** over night and day, so it reads low by day. Only conversions have the real hour, unless question 1 says otherwise.
- **The usual is for the home country, and Live counts every country.** Google's live figures count them all, and Hakken keeps its month by home country. At 10:15 all 26 people on More Handles were in the UK, so it hardly shows there. A website with many visitors abroad would look busier than usual than it is. The hover says so.
- **Addresses and Classifications are a best match on the title.** A page with no saved title has neither, and a title used twice takes the busier page. Very new pages and search results show "No address saved".
- **Search and basket goes by a page's name,** starting with the names on More Handles. Another website's search and basket pages sit in Not sorted yet until their names are added.
- **Last month's share of views covers its 50 busiest pages.** A page outside them counts as having no share, so it can look further above its share than it is. The bar on too few views keeps out most of these.
- **Google counts one person on each page and sometimes in two towns,** so those lists add up to more than the people here. The table says so.
- **Events count times, not people.** Google won't give people by event live.
- **It can't say where visitors came from.** Google's live figures carry no channel. Channels shows that for whole days.
- **A small website's bars swing a lot.** So under 5, no verdict.
- **This goes on top of commits not pushed yet,** and the Channels plan is also waiting. Both touch `messages/` and the eye's screen list, so whichever is built second needs a careful merge.

## Questions for Anthony

None of these holds up the build. If he says go without answering, I use what I recommend.

1. **Save people and views by the hour?** The People and Views marks would then be a usual for this hour, like conversions. It's one more saved list on each night's collection, a small number of extra asks to Google, and it starts filling from the next night's run. It adds 2½ days. **I recommend yes,** as otherwise those two marks include the middle of the night. Reply: "yes" or "not now".
2. **Leave off the Countries and Towns charts?** You'd lose two bar charts. The Busiest town box and the table's Places list still say where people are. **I recommend leaving them off,** as on More Handles it was 26 people in the UK and 21 towns with few in each. Reply: "leave off" or "keep".
3. **Take each conversion's minute back out of the code?** I added it for Way 1's "What just happened" list, and this page doesn't show that list. **I recommend taking it out,** so nothing sits there unused. It's easy to put back. Reply: "take it out", or "keep the list" if you want that list on the page.
4. **People each minute under the four boxes, or above them?** You said "as the first compintent". I drew it as the first chart, with the boxes still on top, as every redone page opens with its boxes. **I recommend leaving it as drawn.** Reply: "as drawn" or "bars on top".
5. **Spend about 80p on real checks, and commit to `dev` once they pass, without pushing?** **I recommend yes,** with the three fixes above committed first. Reply: "yes".

## For the builder: where things live

- **The page:** `src/app/(dashboard)/app/analytics/[siteId]/live/page.tsx`. Its timing is `_components/liveTiming.ts`, which doesn't change.
- **New shared parts:** `src/ui/components/screens/LiveDot.tsx`, `MinuteBars.tsx` and `AgainstBars.tsx`. First versions of all three are in `docs/plans/assets/live-new-page/liveparts.tsx.txt`, as drawn on the board. `LiveFeed` and `CountDots` are in that file too, and aren't to be built.
- **Shared parts used:** `Figure.tsx`, `MapCard.tsx`, `ListTable.tsx` and `Tooltip.tsx` in the same folder, `SiteTreemap` in `app/sites/_components/`, `PageLink` in `_components/AnalyticsCells.tsx`. Copy the map card from `PageKindsCard` in `_components/VisitsCharts.tsx`.
- **The reads:** `convex/googleAnalyticsRealtime.ts` (`askLiveFigures`), `convex/googleAnalyticsLiveUsual.ts`, `convex/pageTitles.ts` and the `holdPages` table, which needs its index on title, `classifierFor` in `convex/googleAnalyticsChannelReads.ts`, and `convex/googleAnalyticsPageKindViews.ts` for last month's Classifications.
- **If question 1 is yes:** `convex/googleAnalyticsSchema.ts` (`ANALYTICS_LISTS`), `convex/googleAnalyticsJobs.ts` (`PAGE_LISTS`), `convex/googleAnalyticsLists.ts`, `convex/googleAnalyticsCollect.ts`, each as `eventHour` is.
- **The eye:** `docs/developer/what-hakken-sees-guide.md` first. `convex/utils/sees/own/googleAnalytics.ts` (`liveFindings`), `screenEntries/googleAnalytics.ts`, `analyticsLive.ts` (`liveSees`), `googleAnalyticsPeriods.test.ts`, `measures.ts`, `_components/useEyeFigures.ts`, the fixture `src/test/fixtures/moreHandlesLive.json`.
- **Ask Hakken:** `convex/assistantAnalyticsReads.ts` (`googleAnalyticsLiveInternal`), `convex/assistantToolHandlers.ts`, `convex/toolConnectorDefinitions.ts`, `convex/toolConnectorPageCharts.ts`, `convex/utils/assistantPageCharts.ts`.
- **Tests that will change:** `googleAnalyticsSecondRoundLook.test.tsx` (case 14), `convex/googleAnalyticsReads.test.ts`, `convex/googleAnalyticsLiveUsual.test.ts`, `convex/utils/sees/analyticsLive.test.ts`, `src/analytics-sees-drift.test.ts`, `src/analytics-asks-drift.test.ts`, `src/translation-parity-drift.test.ts`, `src/seen-words-drift.test.ts` (run `node scripts/seen-words.mjs`), `src/ask-hakken-chart-pages-drift.test.ts`, `src/chart-size-drift.test.ts`.

## What the build changed from this plan

Anthony's go, 2026-11-06: "1) yes pls 2) Yes way 3 is ok 3) yeah 4) as way 3 is desigend 5) yes … go buld this". So people and views are saved by the hour, the Countries and Towns charts stay off, each conversion's minute came back out, the layout stays as drawn, and the work is committed to `dev` and not pushed.

- **The hourly list is cheaper than question 1 said.** It isn't asked each night. It's last month's alone, for the home country, asked as a finished period is (`HOURS_DUE`, `googleAnalyticsJobs.ts`): two asks when a month ends, two when its figures settle, and two on a website's next run if it has none yet. More Handles was filled once by hand to prove it; every other website fills on its next run. Until then their marks stay the even spread, and the words say so.
- **People and views now read truer.** On a Friday at 11am More Handles usually has about 42 people and 161 views in a half hour, against the even spread's 21 and 103. At 3am it's 1 and 3.
- **The Conversions row stays as well as Conversions at this time,** as they're both on the board, though the first is now the only even spread left. It's his call whether to drop it.
- **The look-up runs inside the minute's ask,** not as a screen's subscription, so it's one read a minute however a page is left open. It looks up at most the first 1,000 titles, and 25 pages for one title.
- **`liveSees` stays.** The panel shows its words until the eye is pressed.
- **A device far from usual is only said with the Devices list on screen,** as Google is asked for devices no other time, and this page asks nothing more.
- **Search and basket isn't new.** All pages already has it. Live's map and the eye's comparison now set it apart last month as well (`shopApart`), so it's compared like with like.
- **The map's rule looks at what a group would usually have, not only what it has now.** Cupboard Handles usually has a fifth of the views, and had 5 views: the bar on too few views was keeping out the very news.
- **Two fixes in the shared checker, for every page.** The first press lost its biggest finding: sent back to cover two findings, the writer put them in one sentence of three figures, and the checker dropped it. The send-back now asks for a sentence of its own, and after the rewrite, one figure over stands if that sentence alone carries a finding.
- **The map's words say "1 view",** now that counts can be that small, on Visits too.

## Progress

- 2026-11-06: today's page and three ways drawn, each a different idea, on one real moment. Anthony chose Way 3 with changes, drawn as "The new page so far". Read-only reads of saved figures, and 9 asks of Google. This plan written. The redo isn't built. Overall: about 25%.
- 2026-11-06: three fixes on `dev` at "can we fic these": the Events list, a usual for this hour, and each conversion's minute. Committed first, with each conversion's minute taken back out (44c3eb7c).
- 2026-11-06, Anthony's go: the page, three shared parts, the hourly list, the look-up by title, the eye's rules and Ask Hakken's read, all built. `npm run verify:env`, `lint:all`, `check`, `test:coverage`, `coverage:check`, 19 smoke tests and `build` passed, smoke and build in a copy. Committed to `dev`, not pushed.
- **Real checks, about 37p of the 80p.** Four eye presses on More Handles (about 21p), read in full with their run logs, on the refresh that spends no company credits. Fifteen questions to Ask Hakken (about 16p): More Handles, Ronins and Korda. Real figures read for More Handles, Ronins, Korda, NEC and Hurtwood House. About 15 minutes of the page's asks of Google, far under the 240 reports allowed for.
- **The page was checked with real figures in a test browser, at 3,200 wide, 1,440 and 390:** its parts, its words, its hovers and no sideways page. Every figure on it was real.
- **Not done, as Anthony's Hakken Chrome profile wasn't connected and this browser isn't signed in:** the page in the signed-in app, with its minute-by-minute slide and the eye's panel; a press on Ronins, which needs its workspace chosen there; and "Show people each minute as a line", as a chart can only be redrawn from the eye's chat. These wait for that one check. Overall: about 95%.
