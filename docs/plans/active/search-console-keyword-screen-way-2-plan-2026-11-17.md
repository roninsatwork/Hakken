# Search Console — a keyword's own screen, Way 2 (17 November 2026)

Anthony picked Way 2 on the canvas https://claude.ai/artifact/RVZFx1uuBruW5tGkDP4We5 ("i think i prefer 2"), had
"Where the clicks came from" taken off it ("where the clicks come from graph"), then said "ok im good, did you want to
plan it". This is what gets built, from shared parts already on the redone pages, and nothing else.

## What the page shows, top to bottom

1. **The header, as today.** The way back, the keyword, its line, and Track this keyword.
2. **The eye and Ask Hakken, then Web and News**, as today.
3. **The four boxes**, as today.
4. **The day chart** becomes the shared `DaysChart` (Overview, Visits, Performance), full width. **Show**: Clicks,
   Impressions, Click-through rate, Average position. **Compare with**: the span before, laid under the same dates, or
   No comparison. It replaces the two-scale chart on this screen only.
5. **Which page Google shows, and which gets clicked**: the shared `HundredStrips` in a `MapCard` (Overview,
   Performance), full width. The top row is where 100 impressions went, page by page. The bottom row is where 100
   clicks went. The six pages Google showed most are named, the rest are "The other N", and the line under the title
   says how many pages Google showed and how many got a click.
6. **Pages it brought people to**: the lean table (AGENTS.md "Tables are lean"). Page, Clicks, Up or down, Shown, CTR,
   Position. Tracking a page, and its count of keywords, are on the page's own screen.

**Gone from this screen**: Where the clicks came from, the countries and devices beside the chart. The keyword's
countries page stays, but nothing on this screen links to it any more.

## Limits, said on the page

- The bands name six pages and put the rest in "The other N". The table lists them all.
- A keyword's figures are your home country's, as the boxes are. The page already says which country.

## Reads

- `searchConsoleKeySeries` also returns `daysBefore`, the span before's days, for the grey line. It already asks Google
  for those days with the dates, so there's no extra ask.
- The bands read the pages this keyword brought people to, the same list the table reads. Where the table holds only
  one page of rows, one more read takes the six pages Google showed most, with the list's totals.
- `searchConsoleKeySplits` is no longer asked on a keyword's screen: one fewer ask to Google each time it opens.

## The eye

- Today's findings stay: the move against the span before, the click rate against your website's at the same place,
  and a search split between pages.
- The finding on countries and devices goes, as the screen no longer shows them ("nothing the screen doesn't speak
  about", docs/developer/what-hakken-sees-guide.md).
- One new finding from the bands: how many pages Google showed, how many got a click, and the share of clicks the top
  page took.
- Held on every period the date menu offers, on More Handles' figures for "more handles", in a new fixture. Recording
  it asks Google about 12 times, two for each period, well inside the allowance.
- Every read loads on every period on dev for More Handles. One real press, about 5p, with Anthony's OK.

## Not in this piece

- **A page's own screen.** The same code draws it, and it keeps today's layout until its own board is drawn and agreed.
  Its table stays on the frozen list until then.
- The "Bringing them up to…" notice on finished months (`behindOf` in `convex/searchConsoleCatchUp.ts`), still a fault
  of its own.

## Size

About two developer days. Built on `dev`, and not committed until Anthony asks.

## Built — 17 November 2026

Built on `dev` the same afternoon, after "Yes, build it". Not committed.

- The screen: `_components/SearchConsoleRecordScreen.tsx` draws a keyword's screen in the new way and a page's as
  before. The day chart is Performance's own `PerformanceDaysCard`, which now takes an `exportName`. The bands are
  `_components/KeywordRecordParts.tsx`, with their figures in the plain `_components/keywordSees.ts`, which the eye's
  tests use too. Performance's `oneDecimal` and `per100` are shared rather than copied.
- Reads: `searchConsoleKeySeries` returns `daysBefore`, from the same ask. The list hook hands out `allLiveRows`, every
  row Google answered before the table's search and chips, for the bands. A keyword's screen no longer asks for its
  countries and devices.
- The eye: the countries and devices finding runs on a page's own screen only, and a new finding says the top page's
  share of the keyword's clicks, with how many pages Google showed and how many got a click. Ask Hakken's description
  of the screen says what it now shows.
- Tests: on every period, on "more handles"' own figures recorded with 12 asks to Google
  (`src/test/fixtures/moreHandlesSearchConsoleKeywordScreen.json`, `searchConsolePeriods.test.ts`). The approved look
  `Keyword.txt` is rewritten for the new screen.
- Checked in Anthony's Chrome on More Handles, "more handles", on every period: the day chart, the bands and the lean
  table, one line a row, no console errors. Last 12 months has no Compare with, as Google keeps no span before it. A
  page's own screen is unchanged.

Pressed once on 17 November 2026 (Last month, "more handles", Anthony's "Yes, press it"): three findings from the
code, then four sentences and three steps, every figure right (96 clicks against 82, 8.7% clicked against the
website's 2.4% at place 1, 52 pages shown with the home page taking 84.7% of the clicks, and /home shown 1,090 times for
4 clicks). Two model calls on Gemini 4 Argon, $0.046, 20 seconds. The Editor sent the first draft back partly for
"typing" the 1 in "at place 1", which is the comparison's own name ("The whole website at place 1"); the second said
"at the top spot" instead. `typedNumbers` now accepts a whole-number place on Google ("at place 1", "places 4 to 10");
a place with a decimal and a move in places still count (Anthony: "Yes, fix it").
