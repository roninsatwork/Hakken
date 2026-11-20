# Search Console — Shown but not clicked, Way 2 (20 November 2026)

Anthony looked at Shown but not clicked "in this way" after Almost there left the menu, said "yes draw 3 variations", and
on the canvas https://claude.ai/artifact/1vT2QzNsuDXvmLTp2ihWnn picked Way 2: "ok i think we build way 2 and also wire it up
to what hakken sees please". The boards are saved in `docs/plans/assets/search-console-shown-but-not-clicked-way-2/`
(`Today.dc.html`, `Way2.dc.html`, and the board's code as `board.tsx.txt`, with `build.mjs.txt` and `prep.py.txt`, which
drew them from the app's own parts on More Handles' real figures).

## What he said on the canvas, and what it changed

- "idont liek tehj lnaugue ots too completex": every line leaned on "your usual rate". The words were rewritten to talk
  about clicks: "Shown a lot, clicked a little", "Clicks you'd usually get".
- "is this a place on google maps", then "Place seems to have failed on all accounts": every "place" became "position",
  Google's own word and the tables' heading.
- "remove this", of the line under the boxes: gone.
- "does the page respect the country selector": yes, as built (below). Today's page didn't.
- "ok this is confusing to the user", of the table's Missed column: the table shows two plain numbers side by side, the
  clicks a page got and the clicks it would usually get. CTR, the usual rate and Missed are gone from the table (the
  download keeps the rates).

## What the screen shows, top to bottom

1. **Title and line.** "Shown but not clicked". Under it, "Pages Google shows a lot that people rarely click. A better
   title in Google often fixes it." Then the kind of result, as today.
2. **Four boxes**: "Shown a lot, clicked a little" (130, "Out of 6,439 pages Google showed"), "Times Google showed them",
   "Clicks they got", and "Clicks you'd usually get" ("That's 358 more than they got"), over every page listed.
3. **Clicks at each position in Google** (the shared `MirrorBars`, its first screen, in a `MapCard`). A bar for each
   position, 1 to 20: above the line the clicks these pages got there, below it the clicks they'd usually get. Count:
   Clicks or Pages (the pages with few clicks above every page Google showed there), kept in the address. Zones behind
   name the top 3, 4 to 10 and 11 to 20.
4. **The table**, lean: Page, Shown, Position, Clicks, Usually, the most clicks short first. Classification and Position
   menus. No Device menu (as Pages, 17 November: a page split by device loses the searches Google keeps private).

**The country menu.** Every figure is the country chosen: the list is the country's own pages (`inCountry`), as Pages
reads them since 18 November, against the website's own click rate at each position in the same country. Today's page
counted every country (16,283 pages for More Handles in October) under a notice saying so.

**The rule, unchanged.** A page's usual click rate is the website's own at its average position, rounded (Click rate by
position, positions 1 to 20). What it would usually get is its times shown at that rate, rounded. It's listed when it got
fewer clicks. Way 3's keyword-by-keyword check, fairer than a page's average position, wasn't picked.

## Reads, and page speed

No new read. Each position's figures and the three pages short by most clicks come with the list read the page already
makes (`Summary.lowCtr`, `lowCtrOf` in `convex/utils/searchConsoleViews.ts`), in the same pass, on the ready-made path and
the list asked of Google alike; the three are named with their titles (`withTitles`). Each row carries the clicks it's
short (`gap`, as Real against estimated's), so the table opens on the most short.

## The eye (What Hakken sees)

Its own rules (`convex/utils/sees/own/searchConsoleLowCtr.ts`, `general: false`), over the list's own figures:

- the pages' clicks against the clicks they'd usually get (the headline);
- how few of every page Google showed they are;
- the page short by most clicks, by its title;
- the position short by most clicks;
- how much of the shortfall sits at positions 4 to 10 (a new figure, `clicksShort`);
- the Classification with most of these pages, where the website has Classifications.

The page hands the eye slim figures (`lowCtrSeesData`): only what it shows or its rules read, and the table's own columns.
The screen entry names the boxes, the chart and the table, and adds two never-says: a usual click rate is the website's
own past, never a promise, and pages not on the list aren't spoken of. The fixed lines (`searchConsole.seen.lowCtr`) were
rewritten in the same words, with no colon, so one entry came off `scripts/word-style-allowlist.json`.

**Ask Hakken** reads the screen (`screen: "lowCtr"` in `assistantSearchConsoleReads`): its boxes, each position's figures
and the pages short by most clicks, with the rule said as the screen says it.

## Built — 20 November 2026, on "ok i think we build way 2"

Built on dev, not committed.

- **Server**: `gap` on Shown but not clicked's rows, `Summary.lowCtr` (`lowCtrOf`, `LOW_CTR_TOP`) on both read paths, its
  validator, the pages short most named with their titles. On dev for More Handles, every period this week to the last
  12 months loads (about two seconds from the command line each): this week 15 pages, last month 130 (233 clicks, 591
  usually), the last 12 months 485.
- **Screen**: `shown-but-not-clicked/page.tsx` and `_components/LowCtrParts.tsx` (`LowCtrBoxes`, `LowCtrPositionsCard`),
  in English and Italian (`searchConsole.lowCtr`).
- **The eye**: as above, registered in `SEARCH_CONSOLE_OWN`; off the to-do list in `src/ask-hakken-chart-pages-drift.test.ts`.
- **Ask Hakken**: `lowCtr` in `SEARCH_CONSOLE_SCREENS`, its address, its read, and the tool's description.
- **Tests**: `lowCtrOf` and `gap` (`searchConsoleViews.test.ts`); the screen (`searchConsoleLowCtr.test.tsx`: the country's
  own pages, the most short first, no Device menu, the boxes' words, Count in the address, the table's headings); the look
  test moved here (`look/LowCtr.txt`, the old outline removed); the eye on every period, this week included, on
  `src/test/fixtures/moreHandlesSearchConsoleLowCtr.json` (read on dev with no asks of Google): six findings on each, the
  headline first.

**The real press, on Anthony's "Yes, press it"** (Last month, the United Kingdom): two model calls, 24 seconds, $0.055.
The first draft went back once (a sentence over 20 words). Four sentences and three steps, every figure right: 233 clicks
against 591; positions 4 to 10 are 215 clicks short (60.1% of the 358); position 7 got 60 against 151; the bathroom door
lock guide 4 against 40. Three faults, fixed after without pressing again:
- The figures said "Handles: 21.5% of all the pages", when it was 28 of the 130 pages listed. The Classification's share is
  now of these pages (`lowCtrPages`).
- A step said "your other first-page places". The screen entry now tells the writer to say position, never place.
- The step about the bathroom door lock guide linked to Pages. The page now hands the eye its three named pages' own
  screens as links.
Because the figures changed, the next open of the panel writes again (about 4p).

**Not done**: the full gate; nothing committed.

## Change log

- **2026-11-20** — Drawn (today plus three ways), the words rewritten twice on the canvas, Way 2 picked and "build".
- **2026-11-20** — Built on dev, not committed (above).
- **2026-11-20** — Pressed once ($0.055, every figure right), three faults fixed after (above).
- **2026-11-20** — Renamed **Low click rate** on Anthony's "ok call it low click rate", after "is Shown but not clicked the
  right name for this page": these pages do get clicks, just fewer than usual. "Shown a lot, clicked a little" was too
  long for the menu, and "Click rate" alone would sound like every page's click rate. The address stays
  `/shown-but-not-clicked`, as Classifications kept `/demand-by-service`. The menu, the title, the eye's link and its
  screen entry, Click rate by position's two mentions, Ask Hakken's description and the approved look's title, in English
  and Italian ("Tasso di clic basso"). The first box keeps "Shown a lot, clicked a little".
