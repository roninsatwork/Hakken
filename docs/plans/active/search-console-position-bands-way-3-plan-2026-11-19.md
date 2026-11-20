# Search Console — Position bands, Way 3 (19 November 2026)

Anthony picked Way 3 on the canvas https://claude.ai/artifact/JFwoa4HbbTBgCgXLBiAXy9 ("lets build way 3 please and
remember to hook up to ask hakken, respect the country selection, and remember animations and page load speed"). On the
same canvas he asked for Way 2's ShiftLines to be built as a shared part ("lets build this as a shared component please i
like this"). The boards are saved in `docs/plans/assets/search-console-position-bands-way-3/` (`Today.dc.html`,
`Bands.dc.html`, and the board's code as `board.tsx.txt` and `parts.tsx.txt`).

New parts are allowed when each is a shared part other screens can use (Anthony, 19 November 2026). Two are built here.

## What the screen shows, top to bottom

1. **Title and line.** "Position bands". Under it, "Where on Google your clicks come from in these dates. A band is a group
   of places, like the top 3." Then Web and News, as today.
2. **Four boxes**, as today's, in the redone boxes' words: Top 3, 4–10, 11–20, 21 and below, each "▲ 37% more than the 3
   months before". Today's say "▲ 1,375 on the 3 months before".
3. **Clicks at each place on Google** (new shared part, `MirrorBars`, in a `MapCard`). A bar for each place, 1 to 30, and
   31 and below. Above the line, the keywords that got a click there. Below it, their clicks, or their impressions
   (Count). Brand searches, Left out or Counted, opens Left out. Zones behind name the bands. A place is Google's average
   position rounded up, so each bar sits in the same band as the boxes and the table (3.4 is in 4–10).
4. **Keywords in each band, week by week**: today's chart, with the top 3 in orange at the bottom (today it's a thin
   amber strip, and orange is 4–10). 21 and below is off at first, with one line: "21 and below is off at first. Older
   weeks are missing some of its keywords."
5. **The table**: today's lean table, unchanged.
6. **The eye and Ask Hakken**, on the screen's own figures (below).

**The country menu.** Every figure is the country chosen, as today: the boxes, the new chart and the table come from the
same list read, which is the country's own (kept ready) or asked of Google with its filter. A list asked of Google today
carries no whole-list figures at all (`summarise` in `searchConsoleLiveList` never asks for them), so the new chart would
be empty for a country not kept ready, a device chosen, or custom dates. It gets them too, in the same pass.

## Reads, and page speed

- **No new read.** Each place's figures come with the list read the page already makes (`searchConsoleListPage`, or
  `searchConsoleLiveList`), in the whole-list figures (`Summary.wholeList.places`): 31 places, six numbers each, worked
  out in the pass over the rows that already counts each band's clicks. That's the fast path's columns
  (`searchConsoleKeywordTable.ts`), the row-by-row path (`listSeesOf`) and the live path, held to the same answer by a test.
- **Timed on dev on every period** for More Handles before and after, from `npx convex run … --identity`. The page must
  load no slower.

## Animations

The new parts come in as the redone charts do, through the app's own entrance (`ChartReveal`), never a second one.
`ChartReveal` gains `figures` (what it moves, beside recharts' own layers) and a `fall` motion (bars growing down from
their line). MirrorBars' bars above the line rise, and those below fall, each its own share of the way, and again when
the dates or Brand searches change. A computer set to reduce motion gets the chart drawn at once.

## New shared parts

| Part | What it shows | Other screens that could use it |
|---|---|---|
| `MirrorBars` | Two counts on one scale of steps, one above a line and one below, with named zones behind. | Visits and sales each hour, people and sales each day of the week. |
| `ShiftLines` | A row each, a hollow dot before and a filled dot now, joined by a line, on one scale, with named zones behind. | Tracked keywords, a keyword's pages on its own screen, Bing's places. |

Both take plain figures and words, read nothing, are plain rows and boxes in the page (so the words never stretch), stack
on a phone, and use the shared hover (`MouseReadout`). They go in `src/ui/components/screens/`, the drawing kit and
`docs/developer/screen-kit.md`, each with its own test. ShiftLines isn't on a screen yet.

## The eye (What Hakken sees)

Position bands keeps its own rules (`bandsFindings`, shared with Keywords) and gains rules for the new chart, from
`wholeList.places`:

- The place that brings the most clicks, without brand searches, against place 1.
- Where the clicks fall away: the clicks from places 4 to 10 against 11 to 20, for every keyword that got a click.
- The busiest place just off the first page (11 to 13): its keywords and clicks, as a push worth making.

The screen entry's parts name the new chart, the writer is told what a place is, and the fixed lines that say "than the
days before" name the dates. Held on every period the date menu offers on More Handles' real figures (a new fixture of each
period's places, read from dev with no asks of Google), each finding the headline and at least four things. One real
press on your OK, about 3p to 6p, with its words and run log read.

**Ask Hakken** reads the screen's figures through `assistantSearchConsoleReads` (`screen: "bands"`), which gains each
place's figures (`clicksAtEachPlace`), so a question about the chart is answered from the same numbers.

## Words

Every line copies the redone screens (`searchConsole.performance`, `.keywords`, `.places`, `.services`) and passes
`npm run check:reading` and `npm run check:words`, in English and Italian. Today's chart hint and the fixed eye lines
come off the frozen lists.

## Tests

- `MirrorBars.test.tsx`, `ShiftLines.test.tsx`, and `ChartReveal`'s new options.
- `placesOf` in `searchConsoleViews.test.ts`, and the fast path held to the row-by-row answer
  (`searchConsoleKeywordTable.test.ts`); the live list's whole-list figures.
- The screen's tests: the new chart, Brand searches, Count, 21 and below off at first, the country followed.
- A look test for the screen (`look/PositionBands.txt` beside the boards).
- The eye on every period; the Ask Hakken read.
- The full local gate before anything is committed, GitHub's own steps included.

## Open, with my recommendation

- **Older weeks at 21 and below.** Days older than 60 are kept as month books built while a keep rule dropped searches
  with no click below place 20, so older weeks always miss some of that band (More Handles: about 10 a week before
  8 July, about 1,400 to 20 September, 5,000 to 7,000 since). Fixing it means asking Google again for up to 16 months,
  website by website, within its quotas. Recommendation: build as drawn now, and plan the refill separately if you want it.

## Size

About 2½ developer days. For me, a few hours, then the press on your OK.

## Built — 19 November 2026, on Anthony's "lets build way 3 please"

Built on dev, not committed.

- **Shared parts**: `MirrorBars` and `ShiftLines` in `src/ui/components/screens/`, each with its test, in the drawing kit
  (`scripts/drawing-kit/parts.tsx`) and `docs/developer/screen-kit.md`. Both are plain rows and boxes, use the shared hover
  (`MouseReadout`) and come in through `ChartReveal`, which gained `figures` and the `fall` motion (its test too).
  ShiftLines is on no screen yet.
- **Reads**: `placesOf` and `placeOf` in `convex/utils/searchConsoleViews.ts` (a place is the average position rounded up,
  31 for 31 and below; only searches with a click; brand searches counted apart). In the whole-list figures on all three
  paths: the columns (`searchConsoleKeywordTable.ts`), the rows (`listSeesOf`), and the live list, which had none before
  (`searchConsoleLiveList`'s `summarise` now asks for them). On dev for More Handles every period this week to the last 12
  months loads with its 31 places, their clicks the list's total each time. The work is half a millisecond over 51,384
  keywords and 3.6 KB of a 18 KB answer; a read takes 1.4 to 1.8 seconds from the command line, as a small read does.
- **Screen**: `position-bands/page.tsx` as drawn. The boxes share Countries and devices' change line (`MoveLine`,
  exported, with `neutral`). Clicks at each place on Google, with Brand searches (Left out, Counted) and Count (Clicks,
  Impressions), remembered in the address. A figure of 10,000 or more under a bar is said short ("165.1k"); the hover says
  it whole. The weekly chart has the top 3 in orange and 21 and below off at first, with its line.
- **The eye**: `convex/utils/sees/own/searchConsoleBands.ts`. Three rules on Position bands only: the busiest place against
  place 1, and the edges of the first page (11 against 10) and the top 3 (4 against 3), never naming the busiest place
  twice. The page hands the eye slim figures (`bandsSeesData`, `bandsSeesRows`): each place's keywords and clicks without
  brand searches, the list's own figures the page shows, and the table's own columns. A row has 26 fields since November,
  and with them the writer's brief ran past its 8,000 characters on today's figures (5,742 now on last week, the biggest).
  The screen entry names the new chart. The fixed lines name the period as Keywords' do, with no colons: three entries
  off `scripts/word-style-allowlist.json`.
- **Ask Hakken**: `assistantSearchConsoleReads` hands `clicksAtEachPlace` and what a place is for `screen: "bands"`.
- **Tests**: the parts' tests, `placesOf`, a kept list's places and a live list's, the screen's (the country's own list,
  brand searches left out, Brand searches written to the address, 21 and below off), the look test moved to this plan's
  folder (`look/Bands.txt`, the old outline removed), and the eye on all seven periods on
  `src/test/fixtures/moreHandlesSearchConsolePositionBands.json` (read on dev, no asks of Google). 852 tests in the
  affected suites passed, with `check:guards`, the type check and lint on the changed files.
- **Checked in Anthony's Chrome**: Last 3 months, Last 12 months (Counted, Impressions) and This week, the hover, at
  3,200 wide, with no console errors. The eye panel wasn't opened: opening it writes.

**The real press, on Anthony's "Yes, press it"** (Last 3 months, the United Kingdom): two model calls, 26 seconds,
$0.053. The first draft went back (three figures in one sentence, two findings left out); it had said the top 3's clicks
fell slightly, 1,270 to 1,256, which the rewrite dropped. Four sentences and three linked steps, every figure right: the
top 3 up 37.4% to 5,056, places 21 to 50 down 29.8% to 14,933, place 7 bringing 513 clicks without brand searches against
place 1's 58, 271 new in the top 3 and 182 lost. Two faults:
- "Climbing steadily through November" names no figure: the weekly chart went 1,293, 1,295, 1,358. A guess of that kind
  is the shared checker's to catch (AGENTS.md), so it's left for Anthony's word.
- The first step read place 7's clicks as a click rate to look into. Fixed after: the busiest place's finding now carries
  how many keywords sit there and at place 1, and the chart's part says a place brings more clicks mostly because more
  searches sit there. The page's one-line description no longer ends on the place rule, which the run log read as
  "rounded up to search".
Because the finding gained figures, the next open of the panel writes again (about 5p).

**Pressed again, on Anthony's "Yes, press again".** Opening the panel kept the saved words (the figures it keys on
hadn't changed), so the panel's Refresh was pressed. That write failed: the writer's answer had quote marks inside a
sentence (`"Your big "door handles" search…"`), so it wasn't JSON and the whole press was thrown away ($0.027, not
charged). Fixed in the shared reader every eye press and Insights writer uses (`readJson`, `withInnerQuotesEscaped` in
`convex/insightsAsk.ts`, with tests): only when an answer isn't JSON as it stands, a quote mark inside a string that isn't
followed by a comma, colon or closing bracket is escaped. The thrown-away answer reads with it: 5 sentences, 3 steps.

The next open wrote: one model call, 45 seconds, $0.061. Four sentences and three steps, every figure right; the misread
step is gone ("Grow your high-click searches in Place 7 and places 11–20, starting with "door handles", into the top 3";
Wins and losses for "more handles carlisle"; New and lost for the searches that left 21 to 50). Still open:
- The writer did use the keyword counts ("Place 7 brings 513 non-brand clicks, beating Place 1's 58 clicks because more
  of your searches sit there"), but the guess check left it off: it says "because" without naming how many searches sit
  there, and a third figure would break the two-figures-a-sentence rule.
- "Climbing steadily into November" came back, and the guess check let it through. It's the shared checker's to catch.

Presses today: $0.053, $0.027 (failed, not charged) and $0.061.

**Not done**: the full gate (`npm run check`, coverage, smoke, build); nothing committed. Open: the older weeks at 21 and
below (above), and the two eye points just above.

## The chart taken off — 19 November 2026, on Anthony's "remove the chart but keep the shared component as we will use it elsewhere"

After the presses, Anthony said "i never asked for this chart on this page: Clicks at each place on Google". It was Way
3's on the canvas; he chose to take it off and keep the part. Taken off with it, so nothing speaks of a chart that isn't
there: the card and its words (`searchConsole.bands.places`, English and Italian), the eye's three place rules and the
chart's line in the screen entry, Ask Hakken's place figures, and the place figures the server added to the list
(`placesOf` and the `places` field), which nothing else read and which cost each read 3.6 KB. The saved fixture no longer
carries them. The line under the title is now "How many of your keywords Google shows in each band in these dates. A band
is a group of places, like the top 3." The approved look (`look/Bands.txt`) was written again without the chart; the board
saved beside it (`Bands.dc.html`) still draws it, as the record of what was drawn and picked.

Kept: `MirrorBars` and `ShiftLines` as shared parts (screen-kit.md says neither is on a screen yet), `ChartReveal`'s
`figures` and `fall`, the live list's whole-list figures (the eye's band rules read them), the slim figures the page hands
its eye (`bandsSeesData`, `bandsSeesRows`), the fixed lines' wording, and the shared reader's quote-mark repair. The eye
on every period holds the headline and at least four things where a fair span before exists, and at least two on the
last 6 and 12 months, as it did before this build. 1,420 tests in the affected suites passed, with the guards, the type
check and lint. Checked in Anthony's Chrome with no console errors.

## Change log

- **2026-11-19** — Drawn (three ways, then three more with new shared parts), Way 3 picked and "build", ShiftLines asked
  for as a shared part.
- **2026-11-19** — Built on dev, not committed (above).
- **2026-11-19** — The chart of each place on Google taken off on Anthony's word; MirrorBars kept as a shared part (above).
- **2026-11-19** — The full gate passed on Anthony's "Yes, run it": verify:env, lint:all, `npm run check` (9,638 tests, none
  over five seconds alone), coverage and its check, the browser smoke tests (19) and the build (159 pages), in a copy so the
  app on 3000 kept running, and `git diff --check`. The first check failed on `seenWords.json`, which still held the old
  fixed lines; written again with `node scripts/seen-words.mjs`. Not committed.
