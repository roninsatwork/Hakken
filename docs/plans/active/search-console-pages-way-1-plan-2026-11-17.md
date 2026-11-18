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

## Follows the country menu — 18 November 2026

Anthony, 18 November 2026: "the pages screen is showing numbers not consistent with the other pages - we need to ensure
this is aligned." For More Handles on Last month, Pages' boxes said 8,714 clicks, every country's, with "▼ 7.2% on the
month before" and a line saying the United Kingdom had 7,124 on its own. Every other screen said the United Kingdom's 7,124.

### What changed, and why

Pages and a page's own screen follow the country menu now, as Performance, Keywords, Demand by Classification and Countries
and devices do. Google leaves out the searches it keeps private whenever a country is named, so it ties only some of a
country's clicks to a page: 1,946 of the United Kingdom's 7,124 in October. Pages handles that gap the way Anthony agreed
for Demand by Classification the same day ("The gap Google leaves" in
`search-console-demand-by-classification-way-2-plan-2026-11-18.md`):

- **The four boxes** are the country's own totals, Performance's read, in Demand's wording: 7,124 clicks, "▼ 5% fewer than
  September" (`PagesBoxes`, which draws Demand's `DemandBoxes` in `_components/PagesParts.tsx`).
- **The table, the ticked pages' chart and the eye** share out only the clicks Google ties to a page in that country: 6,439
  pages and 1,946 clicks in October. No row, band or line stands for the difference.
- **No sentence on the page says how it's counted.** The line under the boxes (`PagesCountryLine`,
  `searchConsole.pages.everyCountry`) is gone, from both languages and from the writing guide's phrases.
- **The eye says the gap once**: "Searches Google hides" with its share of the country's clicks (72.7% in October), ranked
  with the headlines so it's said on every period, as Keywords' eye ranks it. The busiest Classification's share is of the
  clicks on the pages (`pageClicks`), never of the boxes', and ranks just above a page's own move, which the table's Up or
  down column already shows (`convex/utils/sees/own/searchConsolePages.ts`). The screen entry says the boxes are the
  country's and the pages share out only what Google ties to a page.

### Reads

- **The list** (`readList`, `inCountry` in `convex/searchConsoleLists.ts`): the main home country's web pages kept for each
  ready-made period and its dates before (`countryPage`, the list Demand reads). Another home country, News, custom dates
  and a period not kept yet answer `live`, and the page asks Google with the country's filter (`searchConsoleLiveList`,
  `inCountry`): pages and their keywords, for the dates and the dates before, four asks at most. The screens not redone yet
  read every country's `page` list, unchanged.
- **The download's Keywords and Top keyword**: `countryPage` didn't carry them. The collector now writes each page's
  keywords and top one beside it, from the same build's searches, the country's (`searchConsolePeriods.ts`). That was the
  simplest honest fix. A finished period settled before today is asked of Google once more for its pages with no searches
  added up in that build, so its download leaves those two columns empty until the period is next built, on 1 December.
  Asked live, the two columns come from the searches Google answers beside the pages.
- **A ticked page's days, a page's own figures, its days and its devices** follow the country (`searchConsoleKeySeries`,
  `searchConsoleKeySplits`, `TickedDays.tsx`). A row's clicks and its own screen's match: the tubular latch guide had 87 in
  October in both, and the home page 184.
- **A page's own screen** lost `searchConsole.record.namedFor`. It set a page's clicks, every country's, against its
  keywords, the home country's. Both are the country's now and add up the same (87 and 87), so the line under the table's
  title is the hint alone.
- **Ask Hakken**: its read of Pages and a page (`assistantSearchConsoleReads.ts`) and its page figures (`assistantReads.ts`)
  read the country's pages, with the boxes' clicks beside Pages' (`countryClicks`); its rule no longer says a page counts
  every country. An alert's page figures are the main country's (`hakkenTaskFigures.ts`).
- `searchConsoleLists.ts` had reached 999 lines: the live list's Sites facts helpers moved to `searchConsoleFacts.ts`.

### The figures for More Handles, United Kingdom, Last month

The boxes: 7,124 clicks, ▼ 5% fewer than September's 7,518. The table: 6,439 pages, 1,946 clicks (2,082 in September).

### Checks

- The eye on all seven periods the date menu offers (`searchConsolePeriods.test.ts`), on a new fixture of the United
  Kingdom's pages and the boxes' figures (`src/test/fixtures/moreHandlesSearchConsolePages.json`, replacing the
  every-country one). A page's own screen's fixture has the tubular latch guide's figures asked again for the country.
- The kept read, its download and the live asks (`searchConsoleCountriesKept.test.ts`); the screen asking in the country,
  its boxes Performance's read and no line under them (`searchConsoleCountry.test.tsx`). The saved outline
  `look/Main.txt` is unchanged: the line was no kit part.
- Every read loads on every period on dev for More Handles, web and News: the list, Ask Hakken's two screen reads and its
  page figures, a page's days. Each answers `live` until the countries' pages are kept.
- Google was asked 32 times: 24 to record the fixture (the list for each of seven periods, pages and keywords for the dates
  and the dates before), 6 for the latch guide's figures, and 2 on dev checks.

### Waiting

- **Nothing is kept in `countryPage` on dev yet.** More Handles' next nightly settle keeps the short periods and the weekly
  one the long. Until then Pages asks Google each time it opens, up to four asks a period, and Ask Hakken says the
  home country's pages aren't added up yet.
- Still every country's: Shown but not clicked, Real against estimated, Tracked pages, Types, Performance's squares and
  bands by Classification, the Hakken stat reports on pages, and Google Analytics' page boxes that read Search Console.
- Checked in Anthony's Chrome at 3,200 and 1,330 wide: not yet. The eye hasn't been pressed.

## Speed fixes — 18 November 2026

Anthony asked for them that afternoon ("add the speed fixes"), after the redone Search Console screens were timed in his
Chrome on More Handles, United Kingdom. Pages took 23 seconds on Last 12 months, Demand by Classification 3 to 6, and
Performance about 3. Measured again on dev the same afternoon, through the Convex logs and `npx convex run … --identity`.

### What was slow, and why

- **Pages asked of Google.** The United Kingdom's pages aren't kept on dev for the short periods until tonight's run, so
  Pages asked Google. On Last month that took 7.4 seconds. Google's list of keywords with their pages, 50,000 rows in two
  asks one after the other, was 5.4 seconds of it. It only gave each page its keywords and top keyword, which only the
  download shows. The same list was asked for September too, and nothing read it. Sites' page types and estimates were
  then looked up for 5,000 pages, a hundred lookups, and every type was replaced by the website's Classification.
- **The lookups queued.** A deployment runs sixteen queries at once. The live list ran sixteen lookups at a time, and the
  catch-up settle ran sixteen of its own. That held Pages on Last 12 months at 19.7 seconds, and every other read on the
  screen waited behind them, the boxes too.
- **The 14.4 MB read** was Performance's list of every country's pages on Last month, read for its Classification
  squares. October and September were kept by two builds, so the read turned both into text from all four of their books,
  each read whole. A list of pages from one build read its book of pages twice, once for the dates and once for the dates
  before.
- **The boxes** already showed on their own figures on both screens. A screen test holds it now. What kept them waiting
  was the queue above.
- **"Leave site?"** came from Convex's own client. It warns while anything is on its way, a read asked of Google included.

### What changed

1. **A live list's facts** (`convex/searchConsoleFacts.ts`). It looks up only what its screen shows (`factsWanted`). A
   keyword's intent is on every list of keywords, and its searches a month only on Almost there and Missed demand. A
   page's type is looked up only until the website has Classifications, and its estimate only on Real against estimated.
   A list of more than 500 pages reads the website's page facts whole, a part at a time (`pageFactsByRange`), the same
   answer in two or three reads. Twelve lookups run at once, not sixteen. On the "all" rule they start as soon as Google's
   answer for the dates is in, while the dates before are still being asked. Demand by Classification looks up page types
   alone. The limit stays as it was, the 5,000 rows with most clicks (`consoleLiveFactsRows`).
2. **Each page's keywords when it's downloaded** (`convex/searchConsoleLiveAsks.ts`). A list of pages asked of Google now
   comes without each page's keywords and top one (`keywordsApart`), unless a rule reads them (Shown but not clicked,
   Pages competing). Pages' and Tracked pages' download asks Google for them when pressed, "Building the file…" while it
   does (`searchConsoleLivePageKeywords`, `PageKeywordsDownload`). Performance's and Types' page summaries leave them out
   too. The dates before's keywords are never asked for a list of pages. A list of keywords with pages asks Google's two
   pages of 25,000 at once (`queryAnalytics`, `together`): one request more when the first page holds everything.
3. **The boxes first.** Nothing on the screens changed. `searchConsoleBoxesFirst.test.tsx` holds Pages' and Demand's
   boxes on screen while Google is still asked.
4. **"Leave site?" only while saving** (`src/lib/leaveWarning.ts`, `src/context/ConvexClientProvider.tsx`). Convex's
   warning is off. The app's own warns while a mutation is on its way, and while any action is that isn't one of
   Search Console's reads asked of Google (`useLiveAsk`, `useLiveAsks`, marked `readOnly`). Every other action still
   warns, the ones that save through an action among them.
5. **The read** (`searchConsolePeriodBooks.ts`, `readList`). Each whole book is read once a read (`BookShelf`). Lists from
   two builds are joined by their keys as text, each list's keys from its own build's book of their kind
   (`keysAsText`). The rows on screen name their top keyword or page from the dates' own book, as before. Demand's kept
   read shares its book the same way.

### Before and after, on dev, More Handles, United Kingdom

| Read | Before | After |
|---|---|---|
| Pages asked of Google, Last month | 7.4 s, 6 Google requests, 100 lookups | 3.6 s, 2 requests, no lookups |
| Keywords asked of Google, 2 to 31 October | 9.6 s | 7.2 s: Google 4.3 s, intents 1.3 s, the same answer |
| Sites' intent for 5,000 keywords | 1.6 s, every fact, 16 at once | 1.3 s, intent alone, 12 at once |
| Demand by Classification asked of Google, Last month | 2 to 8 s in the logs | 1.9 s |
| Every country's pages, Last month (Performance's squares) | 14.5 MB, 0.75 s | 6.9 MB, 0.5 s |
| Keywords, Last month | 8.3 MB | 3.1 MB |
| Performance's top keywords, Last month | 8.3 MB | 3.6 MB |
| The United Kingdom's pages, Last 3 months | 8.5 MB | 4.9 MB |
| Demand by Classification kept, Last 3 months | 8.3 MB | 4.7 MB |

Last 6 and 12 months read the same as before, 4.9 MB for Pages, as they keep no span before. Every period loads for
Keywords and Pages on dev. Performance's own reads take half a second on the server, all at once: its every-country pages
0.5 s and top keywords 0.37 s are the slowest. The rest of its 3 seconds is in the browser, still to be timed in Chrome.

### Google

Asked 25 times on dev, all for More Handles: 3 to time the two lists on their own, 4 for Pages on Last month twice, 2 for
Demand by Classification, 16 for Keywords on custom dates four times. Search Console allows 1,200 a minute. One of the
four Keywords runs took 42 seconds, which the logs don't explain: its lookups were done at 5 seconds. The next, timed ask
by ask, had Google's four pages back in 4.3 seconds.

### Still to look at

- A list read while its dates and the dates before come from two builds still reads both books of pages whole: 5.5 MB
  for More Handles. A website about twice its pages would near the 16 MB again in that state, until the collector builds
  both spans together.
- Google's pairs stop at 50,000 rows (`MOST_ROWS`). More Handles' October reached it, so a live list's keywords per page
  and its keywords list are of the 50,000 Google sent first. No screen says so yet.
- A live list of keywords sends the browser 12.9 MB for 25,000 rows.
- The Google Analytics Live page asks Google every few seconds through its own action, which still shows "Leave site?".

### Checks

- Tests: `searchConsoleFacts.test.ts` (what's wanted, the same answer read whole), `pageKinds.test.ts` (a classified
  live list looks up nothing, Real against estimated its estimates), `searchConsoleCountriesKept.test.ts` (Pages without
  its keywords, the download's ask), `searchConsoleTwoBuilds.test.ts` (each book read once, the same figures and names),
  `searchConsoleApi.test.ts` (both pages at once), `leaveWarning.test.ts`, `searchConsoleBoxesFirst.test.tsx`. One test
  changed with reason: `searchConsoleReads.test.ts` now counts the second page asked beside each list of pairs.

### Checked in Anthony's Chrome — 18 November 2026, 17:40

Seconds until a screen showed everything, charts included, for More Handles in the United Kingdom:

| Screen | Before | After |
|---|---|---|
| Pages, Last 12 months | 23 | 3.1 |
| Demand by Classification, Last 12 months | 6.1 | 1.4 |
| Demand by Classification, Last month | 3.0–5.4 | 4.0, its boxes at 1.2 |
| Pages, Last month | – | 5.4 |
| Performance, Last month | 3.2 | 2.7 |
| Keywords, Last month | 1.7 | 1.7 |

The long periods now read the lists kept by the catch-up that ran from 16:08. Last month still asks Google for October
until tonight's nightly run keeps it. Google's update marks show on Pages' chart (nine on Last 12 months).

**"Leave site?" a second time.** Leaving Pages a second after it opened still warned, for two saves a screen makes as it
opens: the catch-up it asks for (`SearchConsoleCatchUp`) and the eye's note (`useNoteAdvice`). Both carry nothing a person
changed, so both are marked `readOnly`, and the warning now counts every request on its way against the ones marked so
(`src/lib/leaveWarning.ts`). GA Live's ask of Google is marked too. Leaving Pages, Keywords and Demand a second after each
opened asked nothing.

### Google's 50,000 pairs, said — 18 November 2026, evening

Anthony: "yes add it for completeness". Google gives at most 50,000 rows an ask (`GOOGLE_MOST_ROWS`, `searchConsoleApi.ts`).
The lists kept ready get round it by asking a day at a time. A list asked of Google live doesn't, so its keyword-and-page
pairs can stop there, the fewest clicks left out. Keywords' live list is built from those pairs, Pages' download counts
each page's keywords from them, and Shown but not clicked, Pages competing and Click rate by position read them.

- `askGoogle` says when an answer reached Google's most (`cut`). A live list built from or reading the pairs carries it as
  `pairsCut` (`liveRows`, `searchConsoleLiveList`), and Pages' download ask does too (`searchConsoleLivePageKeywords`).
- The table bar then says, once, beside "Asked of Google for these dates": "Google gives at most 50,000 pairs of a keyword
  and a page. Some small keywords aren't counted here." After a download whose pairs stopped there, a message says: "Google
  gives at most 50,000 pairs of a keyword and a page. Some small keywords are left out of the file."
- Checked in Anthony's Chrome: Keywords for 2 to 31 October, asked live, 31,008 keywords, shows the line. 1 to 31
  October reads the list kept for Last month (26,652 keywords) and shows none.
- Held by `searchConsoleCountry.test.tsx`: the line shows once when the pairs were cut, and not when they weren't.

## Review fixes — 18 November 2026

A code review of the day's Search Console work found five faults, and the coordinator added a sixth. All six are built
on dev, uncommitted.

### 1. Alerts keep every country's page figures

A Hakken alert on one page read the main home country's figures from this morning, to match Pages. Alerts set before
today chose their numbers against every country's: More Handles' home page had about 396 clicks from every country in
October against 184 from the UK, so an alert would have fired with nothing changed.

- `targetDaysInternal` (`convex/hakkenTaskFigures.ts`) now takes `countries`, said by every caller. The Watcher and the
  alert's trial when it's set up (`hakkenWatcherActions.ts`, `assistantTaskHandlers.ts`) read `EVERY`, asked of no
  country. Ask Hakken's chart of a page reads `HOME`, as the Pages it links to (`assistantChartHandlers.ts`). A website's
  alert is the home country's, as before.
- The alert's words (`alertTemplate`) say "visitors from Google" and "shown in Google", which stay true of every country.
- A better way, not built: stamp each alert with whose figures it was set against, so a new alert could follow Pages
  while an old one keeps every country.
- Held by `convex/hakkenTaskFigures.test.ts`: `EVERY` asks of no country and `HOME` of the UK, and the Watcher judges a
  page alert on every country's figures (9 a day, where the UK's 4 would have met the rule).

### 2. Every list asked of Google that reaches 50,000 says so

Only the keyword-and-page pairs' cut reached the screen. Now a live list carries Google's own list's cut too
(`listCut`, `liveRows` and `searchConsoleLiveList`), and so do Demand by Classification's and Indexing's live pages
(`cut`, `searchConsoleLiveDemand`, `searchConsoleLiveIndexing`). A list of keywords is its pairs, so it says the pairs'
line as before.

- One shared line, `GoogleCutLine`, says it once in the table's bar beside the count, or under a table's title where the
  table has one. A list of pages cut says its own line in place of the pairs' line, as its keywords are short too.
- Pages, Tracked pages and the other lists of pages, Countries and devices (both tables), Demand by Classification's
  table, Indexing's table and a reason's own table.
- Words: "Google gives at most 50,000 pages in October. Some pages with few clicks aren't counted here.", and the same
  for countries and devices. A list of countries or devices can't really reach 50,000 (Google has about 250 countries),
  so those two lines are there for completeness.
- Not done: Rich results and Click rate by position, which aren't redone yet. A kind of rich result list is a few dozen
  rows at most; Click rate by position reads the pairs and has no table bar line for them today.
- Held by `convex/searchConsoleLiveCuts.test.ts` (Google's most made four, so a few rows reach it) and the screens' tests
  in `searchConsoleCountry.test.tsx`, `searchConsoleLookDemand.test.tsx` and `searchConsoleLookIndexing.test.tsx`.

### 3. Every ask of Google's URL inspection counts against the day's limit

The weekly money-page checks (`moneyPageChecks.ts`) ask the same inspection for the same property, up to 12 pages, and
weren't counted. Now each ask, answered or not, is counted on the page checks' day row for Google's day
(`countOtherAsks`, `searchConsolePageChecks.ts`), and each save of the checks hands back the day's asks whoever made them,
so the 1,600 stays exact while both run.

- A website whose checks have never begun gets no row: a row of nothing would read on Indexing as "All 0 of your pages
  are checked". Those asks are 12 a week at most, inside the 400 kept in hand.
- Neither changes how many pages it checks. Insights is otherwise untouched.
- Held by `searchConsolePageChecks.test.ts`: the money checks' ten asks bring the day to its limit two asks sooner; a day
  with no row is made from the day before; a website never checked gets none.

### 4. The checks are saved every 40

A piece of the website's list holds up to 100 pages, and they were all asked before one save. Now the step asks and saves
them `CHECKS_SAVED_EVERY` (40) at a time. A step that hands on mid-piece starts the next at the piece's own place, where
the pages already checked are passed over. The day's limit is exact inside a slice, and a refusal still stops the day.

- Held by `searchConsolePageChecks.test.ts`, with Google faked and a save every eight: twenty pages asked once each, the
  day's asks seen as 0, 8 and 16 as they go; the limit falling five asks into a slice; a refusal in the second slice.

### 5. Performance follows the country menu everywhere

Performance's Classification squares and bands read every country's pages beside the country's own boxes. They now read
the country's own pages, as Pages and Demand by Classification do (`useSearchConsoleSummaryRead({ dimension: "page",
inCountry: true })`). They share out only the clicks Google ties to a page, so the squares say "The clicks on your pages in
October", Demand's own line, and the note "Pages count clicks from every country, not just your home country." is gone
from the squares and the bands, and from both dictionaries.

- The eye's rules compare a Classification with all the pages, which stays true. Its screen entry now says every figure is
  the country's, the Classifications' pages too (`screenEntries/searchConsole.ts`). Ask Hakken's Performance read reads no
  Classifications.
- `moreHandlesSearchConsolePerformanceSplits.json`: each period's Classifications re-read on dev, the UK's own pages
  (`kindsRecorded`). The eye still finds the headline and four things on every period.
- Performance has no look test. Held by `searchConsoleCountry.test.tsx`.

### 6. In the sitemap, by Google's word or the website's own

For "URL is unknown to Google", Google has no record of the page, so its answer never lists a sitemap. A check now keeps a
page in the sitemap when Google says so or the website's own list does (`holdPages.sitemapFile`), carried through
`pagesToCheck` to the step and `saveChecks`. The checks saved before were brought in line once
(`alignSitemapChecks`): on dev, More Handles' 356 checks were read and 19 changed to in the sitemap, all of them
"Submitted and indexed".

### On dev, More Handles, United Kingdom

Performance's pages, every period: 54 clicks on This week, 393 Last week, 997 This month, 1,946 Last month (against the
country's 7,124), 6,256 Last 3 months, 12,974 Last 6 months and 15,069 Last 12 months. Last month's 1,946 is Demand's
and Indexing's own figure. The first four were asked of Google, three to four seconds each, and none was cut. Demand and
Indexing loaded on every period, none cut; Countries and devices read their kept lists on every period. Ronins'
Performance, Demand and Indexing reads loaded on every period.

Google asked: 20 Search Analytics requests (8 for Performance's pages, 8 for Demand's, 4 for Indexing's), and no URL
inspection.
