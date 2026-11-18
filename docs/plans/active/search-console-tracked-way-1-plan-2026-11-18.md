# Search Console — Tracked keywords and Tracked pages, Way 1 (18 November 2026)

Anthony picked "Way 1 for both" on the canvas https://claude.ai/artifact/XokguWJdBWrZodJUihgHFx, then said "remember we
need to hook this up to what Hakken sees too". The two boards are saved in
`docs/plans/assets/search-console-tracked-way-1/` (`TrackedKeywords.dc.html`, `TrackedPages.dc.html`, and the board's
code as `board.tsx.txt`). This is what gets built, from parts already on the redone pages, and nothing else. Nothing is
built until Anthony says go.

The two screens are one build. They share every part and differ only in what a row is.

## What each screen shows, top to bottom

1. **Title and line.** "Tracked keywords" or "Tracked pages". Under it, "The keywords you track, and how each did in
   these dates. Tick keywords to draw them on the chart." (pages the same). Then Web and News, as today.
2. **Four boxes for everything tracked, together**, each set against the dates before, in the redone boxes' words
   (`DemandBoxes`, the boxes Pages and Demand by Classification share): Clicks and Impressions ("▲ 10% more than the 3
   months before"), Click-through rate ("▼ 0.1 points lower than…") and Average position ("▲ 2.0 places better
   than…"). Today only Clicks is set against anything, and in words the redone screens don't use.
3. **Clicks each day, week or month**: the ticked-lines chart Keywords and Pages share (`TickedDaysCard`), a line for each
   row ticked in the table, five at most. Show picks Clicks, Impressions or Average position. Compare with adds the
   dates before as dashed lines. It opens with the three tracked rows with the most clicks ticked. Google's updates
   are marked on it, as on every chart over dates: the chart part draws them itself (`GoogleUpdateMarkers`).
4. **The table**, lean, one line a row: the tick box first, the name (keyword, or page title cut with "…"), Clicks, Up
   or down, Shown (Impressions on hover), Position, and **Track at the row's end**, so it never sits beside the tick
   box. Clear all, Select top 5, "3 of 5 on the chart" and "10 of 200 tracked" beside the count. Unticking Track stops
   tracking the row and it leaves the list, as today.
5. **The eye and Ask Hakken**, on the screen's own figures (below).

**Tracked pages follows the country menu**, as Pages does since this morning (`inCountry`). Today it counts every
country, so the black door handles page shows 3 clicks here and 1 on Pages. The "Pages count clicks from every country"
notice goes with it.

**When nothing is tracked** (More Handles' keywords today): no boxes and no chart, just the table's empty line, which
says how to track one: "You don't track any keywords yet. Open one on Keywords and press Track this keyword." Today's
says "Click one on Keywords", but a click on Keywords now opens the keyword, and the box there draws the chart. My
recommendation; say if you'd rather keep the boxes showing noughts.

## Reads

- **The tracked list**: the read the page makes today (`searchConsoleListPage`, `view: "tracked"`), the ready-made
  period where there is one and Google asked live where there isn't. Tracked pages adds `inCountry`, as Pages.
- **Each tracked row also carries its impressions in the dates before** (`previousImpressions`, one number a row,
  worked out where the row's clicks before already are, in `shapeRows`). That's what lets the Impressions,
  Click-through rate and Average position boxes be set against the dates before, and follow an untick at once.
- **A ticked row's days**: one ask of Google for each row ticked, with the dates before in the same ask
  (`searchConsoleKeySeries`, through `useTickedDays`), while the page is open. Opening the page asks three times. Google
  allows 1,200 asks a minute for each website.
- **Google's updates** inside the chart's dates: read by the chart itself, as today on every dated chart.

## Limits, said on the page or in this plan

- Five rows on the chart at once, as on Keywords and Pages. A full chart says so on the tick box.
- Up to 200 keywords and 100 pages tracked on a website, as today (`consoleTrackedKeywordsPerSite`,
  `consoleTrackedPagesPerSite`). The count beside the table says it.
- The eye's Google update finding covers only the rows ticked onto the chart, because only their days are read.
- An update is read 14 days either side, as the Google updates screen reads it. One still rolling out isn't read.

## The eye (What Hakken sees)

Built with the screens, not after them. Both screens get **their own findings rules** in code
(`convex/utils/sees/own/searchConsoleTracked.ts`, joined to `OWN_FINDINGS` as `searchConsole.trackedKeywords` and
`searchConsole.trackedPages`). Today they're on the general rules, which say only the count and the clicks' change.

What the rules find, each set against something:

- Everything tracked together: its clicks against the dates before, and its share of all the country's clicks ("1 in
  70 of your clicks").
- The tracked rows that gained and lost the most clicks.
- Keywords only: how many sit on Google's first page against the dates before, naming any that came onto it or
  dropped off it, and the keywords that moved most places up and down.
- Pages only: the page that brings the biggest share of the tracked clicks, against its share before.
- Tracked rows Google didn't show at all in the dates.
- Each ticked row's clicks against the dates before, as Keywords and Pages do.
- The newest Google update that finished inside the dates: each ticked row's clicks in the 14 days before it began
  against the 14 days after it finished.

The writer's "Do first" steps link to Keywords, Pages, Google updates and Volatility. Its words for an empty list are
fixed too. Today they say "Tick the keywords that matter on Keywords, and they are watched every day", which is wrong
since the Keywords redo, and the lines about the clicks join two ideas with a semicolon and say "than the month before".

**Held on every period the date menu offers** (`convex/utils/sees/searchConsolePeriods.test.ts`), on a new fixture of
More Handles' real figures for the same 10 keywords and 8 pages the boards draw (`src/test/fixtures/`), read with
`readFixture`. Each period must find the headline and at least four things. Recording it reads the ready-made lists
(no asks of Google) and asks Google for the three ticked rows' days on each period: 42 small asks, far inside Google's
limits. The recording uses a short-lived internal read, removed straight after, as the Pages and Indexing redos did.

**Every read the screens make loads on every period**, checked on dev with `npx convex run … --identity` before
handing back.

**One real press on each screen**, its words and its run log read, with the cost said first (about 3p to 6p a press),
on Anthony's OK. More Handles tracks no keywords and one page today, so a real press needs some tracked. I'd track the
same 10 keywords and 8 pages on More Handles on dev for it, on your OK, and untrack them after if you want.

Ask Hakken's "Ask about this page" gets the screen's figures, findings and words, as every redone page does. The two
screens come off the Ask Hakken guard's still-to-do list (`src/ask-hakken-chart-pages-drift.test.ts`, 25 → 23).

## Words

Every line copies the redone screens (`searchConsole.pages`, `searchConsole.keywords`, `searchConsole.services.boxes`)
and passes `npm run check:reading` and `npm run check:words`, in English and Italian. The two descriptions come off the
words check's frozen list (`scripts/word-style-allowlist.json`), which shrinks by two.

## Tests

- The screens' tests (`searchConsoleTracked.test.tsx`): the chart opens on the three busiest, Track is the last column,
  the boxes' four lines, an untick takes the row off and the boxes follow, Tracked pages reads `inCountry`, the empty
  line.
- A look test for each screen (`look/TrackedKeywords.txt`, `look/TrackedPages.txt` beside the boards), as every screen
  approved from now on gets.
- `previousImpressions` in `convex/utils/searchConsoleViews.test.ts`.
- The eye on every period, as above.
- The full local gate before anything is committed, including GitHub's own steps (coverage, smoke).

## One fault found while drawing, not in this build unless you say

The dashed "dates before" line starts near nought on Last 3 months, on Pages and Keywords too (checked on Pages in
Chrome). The 3 months before began on 17 May, a Sunday, so its first week holds one day. The fix is in the shared chart
(`DaysChart`): lay the dates before under in weeks that start the same number of days after their first day as this
period's weeks do. About an hour with its test. It changes Performance, Keywords, Pages and Countries and devices' charts
too, so it's your call.

## Size

About 2 developer days. For me, about half a day of work, then the press on your OK.

## Built — 18 November 2026, on Anthony's "Yes, build it"

Built on dev, not committed.

- **Screens**: `tracked/keywords/page.tsx` and `tracked/pages/page.tsx`, from the shared parts: `TrackedBoxes` (Pages'
  `DemandBoxes`), `TickedDaysCard`, `TableTicks`, `trackColumn` at the row's end. Tracked pages reads `inCountry`; the
  every-country notice is gone. The old `TrackedFigures` and its three lines of words are gone. With nothing tracked,
  the table's line alone. Pages and both tracked screens share the "open on the three busiest" rule (`useListOpening`).
- **Reads**: every row carries `previousImpressions` (`shapeRows`, and the keyword lists read as columns in
  `searchConsoleKeywordTable.ts`, which `searchConsoleKeywordTable.test.ts` holds to the same answer). A tracked list's
  summary carries `trackedList` (`trackedListOf`): the dates before added up from the tracked rows, the rows that
  gained and lost most clicks, moved most places, came onto and left Google's first page, the busiest, the one shown 500
  times or more with the fewest clicks for each time shown, and how many weren't shown, named as the rows are
  (`namedTracked`). A list asked of Google works it out again on the page as rows are unticked. The screens also read
  the country's own clicks (Performance's read) for the eye, and Google's updates for the dates.
- **Found while checking in Chrome, fixed**: a page Google never showed in the dates before read as "35.5 places
  worse". When Google showed none of the tracked rows then, each box now says there's nothing to compare.
- **The eye**: `convex/utils/sees/own/searchConsoleTracked.ts`, both screens' screen entries with their parts and what
  they never say. Beyond the plan's list, two findings that don't need the dates before, so Last 6 and Last 12 months
  (no figures from Google before May 2026) still find four things: the busiest row's share of the tracked clicks, and
  the row Google shows a lot that gets the fewest clicks. A share that rounds to 0% is left out, and an update the
  ticked rows had no clicks either side of isn't handed over. The writer is told how tracking is done ("opens it and
  presses Track this…; a tick only draws it on the chart"). The fixed lines' semicolons and their old "tick to track"
  step are fixed in English and Italian. Their "than the month before" stays, as on every Search Console screen.
- **Tests**: `searchConsoleTracked.test.tsx` (11), look tests with new outlines in `look/`, `trackedSees.test.ts` (5),
  `searchConsoleViews.test.ts`, the eye on all seven periods on `src/test/fixtures/moreHandlesSearchConsoleTracked.json`
  (126 asks of Google to record), the Ask Hakken guard (25 → 23), the look guard, and `scripts/word-style-allowlist.json`
  two shorter. The affected suites passed: 1,264 tests at the last full run of them. `npm run check:guards` passed.
- **Checked in Anthony's Chrome** on every period, both screens, no console errors. Every read loaded on every period
  on dev for More Handles.
- **One eye write happened by opening the panel** on Tracked pages (Last 3 months, $0.045). Its words had three faults,
  all fixed above.

**The real presses, on Anthony's "Yes, track and press" (18 November 2026, Last 3 months).** The board's 10 keywords
and 7 more pages were tracked on More Handles on dev through the app's own Track (black door handles already was).
- Tracked keywords: one model call, 14 seconds, $0.030. Three sentences, three linked steps, every figure right (311
  clicks against 282, door handles 12 → 118, art deco door handles 24 → 34). The guess check left off two sentences.
- Tracked pages: two model calls, 141 seconds, $0.071. The first draft went back (three figures in one sentence, one over
  20 words, two findings left out). Four sentences and four steps, every figure right (797 clicks, 3.6% of the country's,
  Antique Brass 92 → 174, Cupboard Handles and Knobs 386 → 205).
- Fixed after reading them: both drafts called the ticked rows "your top pages", so the update sentence was left off as
  a guess. The update's line now says whose clicks ("…, for the pages on the chart") and over which days. And the
  busiest row's share now says it's of the tracked rows' clicks (`trackedKeywordClicks`, `trackedPageClicks`), never
  "of all the clicks" beside the country's share.

**Not done:** the full gate (`npm run check`, coverage, smoke, build); the dated chart's one-day first week (Anthony's
call). Found, not fixed: a page list asked of Google live shows each page's address, not its title, on Pages too.

## Change log

- **2026-11-18** — Drawn (three ways each), Way 1 picked for both, eye added on Anthony's word. Plan written, not
  approved.
- **2026-11-18** — "Yes, build it". Built on dev, not committed (above).
