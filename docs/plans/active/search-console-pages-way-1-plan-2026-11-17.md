# Search Console Pages — Way 1 (17 November 2026)

Anthony chose the board "Way 1 · tick pages to draw them, like Keywords" on the canvas
https://claude.ai/artifact/1zVs7HZ6NPY2zrdPModuao ("Way 1", 17 November 2026). The board is saved as
`docs/plans/assets/search-console-pages-way-1/Way1.dc.html`. This is what gets built, from shared parts already on the
redone pages, and nothing else. Every new line copies the redone screens' words and is measured
(`npm run check:reading`). Nothing is built until Anthony says go.

## What the page shows, top to bottom

1. **Title and description.** "Every page Google showed for these dates. Tick pages to draw them on the chart. Click one
   to see everything about it." Then the kind of result, as today.
2. **Four boxes that count every country**, so they match the table: clicks, impressions, click-through rate and
   position, against the span before. Today they count the home country alone (7,124 clicks in October) while the table's
   pages add up to 8,714.
3. **One line under the boxes**: "These figures count every country, as your pages do. In the United Kingdom alone you
   had 7,124 clicks." The country is the one chosen in the country menu. It replaces today's note about every country.
4. **The chart**: the shared `DaysChart`, a line for each page ticked in the table, five at most. **Show** (Clicks,
   Impressions, Average position) and **Compare with** (No comparison, or the span before as dashed lines in each page's
   colour, lined up by date). It opens with the three pages with the most clicks ticked, as the board does. Each page's
   name in the chart's key is short (Anthony on the canvas, 17 November 2026: "i dont like long axis lables"): the title
   without the website's name after its " | " or " - ", cut to about 28 letters at a word, and "Home page" for the home
   page. The table keeps the whole title.
5. **The table**: today's lean table with the tick box first (`TableTicks`), Clear all and Select top beside the download,
   and "3 of 5 on the chart" beside the count. Its menus are Tracked, Position and Classification. Device comes off, as on
   the board: a page split by device leaves out the searches Google keeps private (the home page drops from 396 clicks to
   255 in October), and the page never says so.
6. **The eye and Ask Hakken**, on the page's own figures: see below.

## Also changed by this piece

- **The ticked-lines chart becomes one shared part** for Keywords and Pages. Today it lives in `KeywordsParts.tsx` for
  keywords alone. Keywords looks and works exactly as it does now.
- **A row that shares its title with another page shows its address.** In October three rows read "More Handles |
  Handles, Knobs & Door Furniture": the home page, /home and a Google Business link. The busiest page keeps the title.
  This is the shared page cell, so it also changes Tracked pages, Shown but not clicked and Real against estimated. It
  needs one new index on the website's page list (`holdPages`, by title), so a page's title can be checked against the
  others in one small read.

## Reads

- **The boxes**: the page list's own totals, which the page already reads. Its summary gains the span before's clicks,
  impressions and position, from the span before's list it already holds. No new read. (The list's own "before" today
  counts only pages shown now: 9,009 clicks in September, where every page shown in September adds up to 9,393.)
- **The line**: the website's figures for the country chosen, the read the boxes make today.
- **A ticked page's days**: the read a page's own screen already makes (`searchConsoleKeySeries`, every country, with the
  span before), asked once for each page ticked while the page is open (`useLiveAsks`).

## Limits, said on the page

- Five pages on the chart at once, as on All pages and Keywords. A full table says so on the tick box.
- Opening the page asks Google three times, once for each page ticked to start, and once more for each page ticked
  after. Google allows 1,200 asks a minute for each website, and doesn't charge.
- Last 12 months has no comparison: Google keeps 16 months, so the 12 before aren't there. The boxes say so, as today.

## The eye

Pages has no rules of its own yet. New ones (`convex/utils/sees/own/searchConsole.ts`, `searchConsole.pages`), from what
the page reads, every country:

- clicks against the span before;
- how many pages got a click, out of all Google showed (2,320 of 16,283 in October);
- how many pages make half the clicks (76 in October);
- the pages that gained and lost most clicks;
- the Classification with the most clicks, and the one that moved most;
- each ticked page's clicks against the span before.

Held on every period the date menu offers, on More Handles' saved figures. The screen's entry for Ask Hakken names the
parts. After building, one press on Last month, with its cost said first (Keywords' press was $0.027), on Anthony's OK.

## A fault found while checking

On **Last 6 months** the span before is far too small. The home page shows 2,483 clicks against 357, and the website's
own figures 45,537 against 6,519, because only 23 of the 183 days before (from 23 April) come back as days. So nearly
every page looks up, today, on Pages and Keywords and in Performance's boxes. I'll find the cause first. If the fix takes
more than a day, I'll say so before going on.

## Not in this piece

- The "Bringing them up to…" notice on finished periods (`behindOf` in `convex/searchConsoleCatchUp.ts`). It's on every
  Search Console page, and is best fixed once for all of them.
- A device split that keeps Google's private searches. Device simply leaves Pages' menus.

## Checks

- Tests: the summary's span-before totals, the ticks and their opening three, the shared title, the eye's rules on every
  period, Keywords unchanged.
- English and Italian kept in step; the reading-age check; the table rule (the page and five figures, the tick box not
  counted).
- The look test's saved outline for Pages is the new look.
- Every read loads on every period on dev (`npx convex run … --identity`), and the page is checked in Anthony's Chrome at
  3,200 and 1,330 wide.
- GitHub's steps run here before any push. Built on `dev`, not committed until Anthony asks.

## Size

About four developer days, most of it the eye's rules and the Last 6 months fault.

## Built — 17 November 2026

Built on `dev` the same afternoon, after "yes please build it". Not committed.

- **The page**: `search-console/[siteId]/pages/page.tsx`; its boxes, line and chart names in `_components/PagesParts.tsx`.
  The boxes read the page list's own figures (`summary`) against `summary.beforeTotals`, every page the span before
  held: 8,714 clicks against 9,393 for More Handles in October. Device left the table's chips.
- **The chart is one part for Keywords and Pages**: `_components/TickedDays.tsx` (`useTickedRows`, `useTickedDays`,
  `TickedDaysCard`). Keywords' `KeywordsParts.tsx` wraps it and looks and works as before. Pages opens with its three
  busiest pages ticked, written into the address once so a sort never changes the chart, and lays each page's span
  before under it with Compare with. Names in the key are short (`shortTitle` in `convex/utils/pageNames.ts`,
  `shortPageName`); their titles come from `pageTitles.pageTitlesFor`.
- **The list's figures** (`convex/utils/searchConsoleViews.ts`, page lists only): `beforeTotals`, `clickedRows`,
  `halfRows` (76 pages make half of October's clicks) and `pageMovers`, the pages that gained and lost most over the
  whole list, named and with their titles by `readList`. A mover needs a third of its clicks in the span before, as the
  eye's `fairBefore`: 2 clicks to 43 is a new page, not a rise of 2,050%.
- **The Last 6 months fault**: Google has no figures for More Handles from 11 August 2025 to 22 April 2026 (asked
  again on 17 November: none for December 2025), as the calendar audit of 21 October found. Every list, Performance's
  boxes and a page's or keyword's own days now set nothing against a span with 28 days or more in a row without figures
  (`spanCovered` in `searchConsoleDays.ts`, `googleHasSpan` in `searchConsolePeriodReads.ts`), judged only from where
  the website's history begins. A quiet day or week still counts as a day of nothing. On More Handles' Last 6 months
  the boxes now say the days before aren't held, and Up or down shows a dash, where nearly every page read up sevenfold.
- **A title two pages share** is kept by the busiest (clicks, then visits, then the shorter address); the others show
  their address (`titleKeeper` in `convex/pageTitles.ts`, by the `by_hold_title` index Live already had). An address
  with a query (the Google Business link, `/?utm_source=GMB…`) shows its address. Titles are kept once for every
  screen, so Google Analytics' page lists follow the same rule.
- **The eye**: `pagesFindings` (`convex/utils/sees/own/searchConsole.ts`): every page's clicks against the span
  before, pages clicked out of all shown, how few make half the clicks, the pages that moved most, the Classification
  with most clicks and the one that moved most, the Classification shown a lot but clicked less than all pages, and the
  page ticked. Held on every period by `searchConsolePeriods.test.ts` on More Handles' figures read on 17 November
  (`src/test/fixtures/moreHandlesSearchConsolePages.json`): four findings or more on each. Pages left the drift test's
  still-to-do list (28 → 27). The screen's entry for Ask Hakken names its parts.
- **Tests**: `convex/searchConsoleGaps.test.ts` (the gap rule, shared titles), list figures in
  `searchConsoleViews.test.ts`, short names in `pageNames.test.ts`. Two tests changed with reason: the load test reads the
  span before's days (and only those), and the collection test's 3 months before, which its fake Google sent no days
  for, is no longer compared. The saved outline `docs/plans/assets/search-console-redesign/look/Main.txt` is the new look.
- **Checked** on dev with `npx convex run … --identity` on every period (each list loads; Last 6 and 12 months compare
  with nothing; a page's days on Last 6 months hold no span before), and in Anthony's Chrome at 1,330 and 1,489 wide
  (the widest that screen allows) on Last month and Last 6 months, with Compare with on and off.

Pressed once on 17 November 2026 (Last month, Anthony's "Yes, press it"): six figures found by code (every page's clicks
down 7.2% to 8,714 from 9,393; 14.2% of the pages got a click; 3.3% make half the clicks; the Blog 25.1% of the clicks;
Cupboard Handles down 10.6% to 1,461 from 1,635; the home page up 21.1% to 396 from 327), then five sentences and four
steps, every figure right. The first draft was sent back once by the checker's own rules (more than two figures in a
sentence, one past 20 words) and passed the second time. Two model calls, 20 seconds, $0.062. Two things to look at:
the words say "earlier" where "in September" is plainer, and "our two main blog guides" speaks as the company; and the
step "Add clear links from our top Blog guides…" links to Tracked pages.

Then, on Anthony's "can we fix the performance work" and "and this please" (17 November 2026):

- **The two Classification tests** in `convex/utils/searchConsoleViews.test.ts`, left failing by the Performance redo's
  new `KindCount` fields, now expect each Classification's times shown and its clicks the span before.
- **"Bringing them up to…" on a finished period** (`behindOf`, `convex/searchConsoleCatchUp.ts`): a list is behind only
  when it stops before the period's own last day, never Google's newest. Last month no longer says it on every open, nor
  asks for the lists to be added up again. Held by `searchConsole.test.ts`; checked on dev on four periods.
- **The eye's words** (`convex/utils/seesAsk.ts`, `convex/seesAskActions.ts`, for every page): the writer is handed the
  dates before by name (`datesBefore`, "September (2026-09-01 to 2026-09-30)") and told to say them, never "earlier";
  the Editor's code says a trailing "earlier" as "in September" and "our" as "your" (`spoken`), with no extra model
  call; and a step links to the page where it is done, even if two steps share one, instead of each its own.
- **3,200 wide**: laid out in Anthony's Chrome at 3,200 (the page scaled to fit the 1,341 window). The chart draws at
  2,576 by 300 in real pixels with 11px words, as on a laptop; the table is 2,616 wide, names whole, nothing sideways.

A page's own screen, on Anthony's "just build it" (17 November 2026): the keyword screen's Way 2 turned round, in
`SearchConsoleRecordScreen.tsx`. Performance's day chart full width with Compare with; the bands of which keywords Google
shows the page for and which get clicked (`KeywordPagesBands` with `of="keywords"`, its words in `record.pageBands`); the
lean table of its keywords (Keyword, Clicks, Up or down, Shown, CTR, Position). Where the clicks came from, its Google ask
and the every-country note are gone; the table's line says the keywords are the home country's. The eye reads the keyword
bands (`recordFindings`), no longer where the clicks came from. Its outline `look/Page.txt` is the new look. Checked in
Anthony's Chrome on the tubular latch guide: 484 keywords, 38 clicked. The line under Pages' boxes now reads "These
figures count every country, like your pages. The country you picked had 7,124 clicks on its own." (Anthony: "the words
are not good").

The full local gate passed on 17 November 2026: `npm run check` (1,126 files, 9,425 tests), `test:coverage`,
`coverage:check`, `test:e2e:smoke` (19) and `git diff --check`. On the way it needed `SearchConsoleSplitList.tsx` gone
(nothing used it once a page's screen lost where its clicks came from), Italian "Home page" translated, Pages' eye rules
and the Search Console helpers moved to `own/searchConsolePages.ts` and `own/searchConsoleShared.ts`, and a page's days
helpers to `convex/searchConsoleSpans.ts` (both files had passed a thousand lines), and three docs naming the AI model
added to the provider guard's list with their reason. `npm run build` was not run.

A page's own screen's eye, on Anthony's "ok do it" (17 November 2026): held on every period by `searchConsolePeriods.test.ts`
on the tubular latch guide's own figures and keywords (`src/test/fixtures/moreHandlesSearchConsolePageScreen.json`, 12
Google asks), in place of the made-up figures it had. It finds the keyword that brings most clicks, its click rate against
the whole website at its place, and, new and said on every period, how few of its keywords got a click; never a country
or a device. Its brief limit is 4,150 (`codeFirstBriefCeilings.json`, was 3,500): it now hands the keyword bands the
screen shows, as the keyword screen does. Recording it found the Last 6 months fault on lists asked of Google (a page's
keywords): `searchConsoleLiveList` now asks no span before Google has no figures for, and sets none against.

Still to do:

- A page's own screen's eye hasn't been pressed.
