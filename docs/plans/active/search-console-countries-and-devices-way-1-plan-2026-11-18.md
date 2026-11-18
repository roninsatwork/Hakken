# Search Console — Countries and devices, Way 1 (18 November 2026)

Anthony first picked Way 2 on the canvas https://claude.ai/artifact/JVzJjPAxZ6tP714WoKsQkZ, then asked for the boxes to
follow the country menu ("does this respect the country selector", "can we align this to the country scope") and
chose Way 1 once that was fixed ("when we fix this way 1 is what i want"). The board is saved in
`docs/plans/assets/search-console-countries-and-devices-way-1/`. This is what gets built, from parts already on the
redone pages, and nothing else. Nothing is built until Anthony says go.

## What the page shows, top to bottom

1. **Title and line.** "Countries and devices". "Every country Google showed your website in for these dates. Tick
   countries to draw them on the chart." Then Web and News, as today.
2. **Four boxes about the country chosen in the menu**, each against the dates before:
   - **Clicks in** the country chosen (the United Kingdom for More Handles: 7,124).
   - **Out of every 100 clicks**, the country chosen's share of all clicks (83, against 81).
   - **From other countries** (1,511).
   - **Countries with a click**, out of every country Google showed the website in (99 of 222).
3. **Clicks each day**: the ticked-lines chart Keywords and Pages share (`TickedDaysCard`), a line for each country
   ticked in the table, five at most. Show picks Clicks, Impressions or Average position. Compare with adds the dates
   before as dashed lines. It opens with the three busiest countries after the one chosen ticked (the United States,
   Ireland and Australia for More Handles), because the chosen country's line flattens the rest. Ticking it adds it.
4. **The countries table**, lean, with the tick box first (`TableTicks`): Country, Clicks, Up or down, Shown
   (Impressions on hover), CTR, Position. Clear all, Select top 5, and "3 of 5 on the chart" beside the count.
5. **Devices in** the country chosen: a lean table. Device, Clicks, Up or down, Shown, CTR, Position. Its title names
   the country.
6. **The eye and Ask Hakken**, on the page's own figures (below).

No sentence on the page explains how the figures are counted. Each title names what it counts.

## Reads

- **Countries**: the website's country list for the dates chosen, every country, the read the page makes today. Plus
  the same list for the dates before, for the boxes and Up or down. Today the dates before aren't kept, so the collector
  keeps them for each ready-made period, as it does for the other lists.
- **A ticked country's days**: one ask of Google for each country ticked, with the dates before in the same ask
  (`searchConsoleLiveDays` with the country set), asked while the page is open (`useLiveAsks`). Opening the page asks
  three times. Google allows 1,200 asks a minute for each website.
- **Devices**: the device list for the country chosen. The home country's is kept by the collector today. Another
  country is asked of Google when it's chosen: one ask for each period.

## Limits, said on the page or in this plan

- Five countries on the chart at once, as on Keywords and Pages. A full chart says so on the tick box.
- The countries table lists every country Google showed the website in. Most have a handful of clicks (More Handles:
  222 countries, 99 with a click, 31 with 10 or more), so it opens on the most clicks first.
- A world map was left out at Anthony's "No map".

## The eye

The page's own findings rules (`convex/utils/sees/own/searchConsole.ts`), from what the page reads:

- the country chosen's share of all clicks, against the dates before;
- the countries abroad that gained and lost the most clicks;
- each device's share of the country chosen's clicks, against the dates before;
- each ticked country's clicks against the dates before;
- how many countries sent a click, against the dates before.

Held on every period the date menu offers, on More Handles' figures, in a new fixture. Recording it asks Google a few
times, inside the allowance. One real press after building, with its cost said first, on Anthony's OK.

## Also changed by this piece

- **Today's faults go**: two tables that counted different things with no word why, no chart, nothing set against
  the dates before, and headings over ten letters ("Share of clicks", "Impressions").

## Not in this piece

- A world map, as Anthony said no.
- Ways 2 and 3. They stay on the canvas.

## Checks

- Tests: the boxes follow the country chosen, the ticks and their opening three, the dates before as dashed lines,
  the devices title names the country, the eye's rules on every period.
- English and Italian kept in step. `check:reading`, `check:words` and the table rule (the name and five figures, the
  tick box not counted).
- A look test's saved outline for the new page.
- Every read loads on every period on dev (`npx convex run … --identity`) for More Handles and Ronins. Then checked in
  Anthony's Chrome at 3,200 and 1,330 wide.
- Google's quota respected: tests use the pretend Google.
- GitHub's steps run here before any push. Built on `dev`, and not committed until Anthony asks.

## Size

About three developer days. Most of it is keeping the dates before's country lists, the ticked countries' days, and the
eye.

## Built — 18 November 2026

Built on `dev` on Anthony's "Yes, build all three", from the board and this plan. Not committed.

### What was built, and where

- **The page** (`src/app/(dashboard)/app/search-console/[siteId]/countries-and-devices/page.tsx`): title and line, Web
  and News, the four boxes, the ticked-countries chart, the countries table and "Devices in the United Kingdom", top to
  bottom as the board draws them. The two tables are one part in the page (`PlacesTable`): the name and five figures,
  one line a row, search, sort, numbered pages and download each. The countries' tick boxes come first, with "3 of 5 on
  the chart", Clear all and Select top 5.
- **The four boxes** (`_components/PlacesParts.tsx`, figures worked out in `_components/placesSees.ts`): every box is
  about the country chosen in the menu, each against the dates before. Its name reads "the United Kingdom" in English
  (`countryInWords`, `_components/countries.ts`).
- **The chart** is the part Keywords and Pages share (`TickedDaysCard`, `_components/TickedDays.tsx`), now with
  countries' words (`searchConsole.places.chart`). It opens with the three busiest countries after the one chosen.
- **The dates before for countries and devices** (`convex/searchConsolePeriods.ts`): the collector keeps them for each
  ready-made period, as it does for pages (`KEEPS_BEFORE`). A finished long period settled before today has its
  countries and devices asked of Google once more, one ask a span, and nothing else of it (`missingBefore`,
  `convex/searchConsoleSlotsKept.ts`).
- **The boxes' totals** (`convex/utils/searchConsoleViews.ts`, `convex/searchConsoleLists.ts`): a country or device list
  now carries the dates before's total clicks and how many countries had a click then (`beforeTotals`,
  `clickedBefore`). `searchConsoleSplitList` returns its summary, and `useSearchConsoleSplit` passes it on with
  Google's problem and a way to ask again.
- **A ticked country's days** (`searchConsoleKeySeries`): widened to a country, its own filter alone, with the dates
  before in the same ask.
- **The eye's own rules** (`convex/utils/sees/own/searchConsolePlaces.ts`), the five in this plan. The screen entry
  names the page's parts (`convex/utils/sees/screenEntries/searchConsole.ts`). `searchConsole.places` left the eye's
  to-do list (`src/ask-hakken-chart-pages-drift.test.ts`, 27 to 26). A `countries` measure was added for "Countries with
  a click".
- **Words** in English and Italian (`searchConsole.places`), and `countries` in the eye's measures.

### What changed from the plan, and why

- **A ticked country's days come through `searchConsoleKeySeries`, not `searchConsoleLiveDays`.** It's the read the
  shared chart already makes for keywords and pages. It sets the dates before only where Google has figures for them
  (`googleHasDays`), which `searchConsoleLiveDays` doesn't. It's still one ask for each country ticked.
- **Devices never ask Google here.** The country menu offers only the website's home countries, and each keeps its own
  device list.
- **Where the dates have no fair span before** (More Handles' Last 6 and 12 months), the eye says each share as it
  stands and nothing as moved. The devices give two findings at most, the busiest and the one that moved most, so they
  never crowd out the countries. A country abroad needs to move five clicks to be said, as Pages' pages do.
- **"The same" in Up or down** for a country whose clicks didn't move, as the board draws it (`figureColumns`' `same`).
  Keywords and Pages are unchanged.
- **The fixed line under the eye** says mobile's share only when the country chosen is the busiest, as its devices are
  now that country's.
- **Italian** says the country as a label ("Clic · Regno Unito"), since Italian puts a different word before each
  country.

### Not done, or waiting

- **Up or down on dev.** The lists on dev were built before today, so every box says "Nothing to compare with…" until
  More Handles' next nightly build (the short periods) and the next weekly settle (Last month's September, Last 3
  months). Nothing was rebuilt by hand.
- **One real press of the eye**, which waits on Anthony's OK.
- **Ronins' reads**: the identity used holds More Handles' company only.
- **`scripts/word-style-allowlist.json`** still lists `searchConsole.places.description`, which is fixed now, so
  `check:words` asks for it to come off. That file belongs to the writing guide's work, so it was left alone.
- **The writing guide's table of redone screens** should gain `searchConsole.places`. That file was left alone too.
- **Checked in Anthony's Chrome at 1,440, 1,330 and 3,200 wide**: not yet.

### Checks run

- `npx vitest run` on every Search Console test (backend, eye and screens) and the drift tests the change touches: 97
  files, 1,290 tests, all pass. New: `convex/searchConsoleCountriesKept.test.ts` (the dates before kept, the settled
  redo, a ticked country's own ask), `src/app/(dashboard)/app/search-console/searchConsoleLookPlaces.test.tsx` (boxes
  follow the country chosen, the opening three, the dashed dates before, the devices' title, lean tables, the saved
  look in `docs/plans/assets/search-console-countries-and-devices-way-1/look/Way1.txt`), and "Countries and devices"
  on all seven periods in `convex/utils/sees/searchConsolePeriods.test.ts`, on a new fixture
  (`src/test/fixtures/moreHandlesSearchConsolePlaces.json`).
- `npm run typecheck`, `npm run lint` on the changed files, `check:reading`, `check:screen-kit` and the other guards
  pass. `check:words` fails only on the allowlist entry above.
- Every read loads on every period on dev for More Handles (`searchConsoleSplitList`, countries and devices, Web and
  News, `--identity`). This week reads as being added up, as it did before.
- Google was asked 26 times: 24 to record the fixture (each period's countries and the United Kingdom's devices, with
  their dates before) and 2 to check a ticked country's days on dev (the United States, Last month and Last 12 months).

## Checked — 18 November 2026, afternoon

- **The eye, pressed twice** on Last month for More Handles (about 4 US cents each). The first press found the faults below. After the fixes, the second press read: "7,124 clicks came from the United Kingdom in October, which is 82.5% of all your clicks." and "Abroad, United States clicks fell from 419 in September to 319 in October."
  - Each device's share was labelled a share of every click ("Mobile in the United Kingdom: 56.3% of all the clicks"). It's now said as a share of the country chosen's clicks (a `deviceClicks` measure).
  - A step sent the reader to Wins and losses for the United States, which no screen can show. The screen entry now forbids a step to another screen for a country abroad.
  - The eye now has the months' names for the dates and the dates before (`SearchConsoleSees`, every Search Console screen), so it says "in September", never "the 28 days before".
- **Ask Hakken, three questions**: which countries abroad are growing, the United Kingdom against September (7,124 against 7,518), and mobile against desktop. Every figure was right. The answers read like reports, with headings and "CTR". That's Ask Hakken's own style, on every page. It's proposed as a task of its own.
- **Anthony's Chrome at 1,348 wide** (his window doesn't go wider) and **at 3,200** in a frame of that width: no sideways scrolling, headings on one line, the chart 300 pixels tall with 11-pixel words at both. The first box's "Clicks in the United Kingdom" goes onto two lines at 1,348.
- Up or down still says "Nothing to compare with September" until More Handles' next nightly build.
