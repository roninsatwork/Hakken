# Search Console Keywords — Way 2 (17 November 2026)

Anthony chose the board "Way 2 · tick keywords to draw them" on the canvas
https://claude.ai/artifact/D1vSPHFgnV1js7aKfyqAZY ("way 2 i think"), then said "Yes, build it" (17 November 2026). The
board is saved as `docs/plans/assets/search-console-keywords-way-2/Way2.dc.html`. This is what gets built, from shared
parts already on the redone pages, and nothing else. He asked again for the language style and reading age: every new
line copies the redone screens' words and is measured (`npm run check:reading`).

## What the page shows, top to bottom

1. **Title and description.** "Every keyword Google showed your website for in these dates. Tick keywords to draw them on
   the chart. Click one to see everything about it." Then the kind of result, as today.
2. **Today's four boxes**, as on Performance.
3. **One line under the boxes**: how many of the website's clicks came from searches Google names, and how many from
   searches Google hides for privacy. Today the boxes say 7,124 clicks and the table adds up to 1,946, and the page
   never says why.
4. **The chart**: the shared `DaysChart`, as All pages draws ticked pages. **Show** (Clicks, Impressions, Average
   position) and **Your whole website** (On, Off). It opens on the whole website with nothing ticked, as All pages does
   (Anthony, 4 November: "make this the default view"). Each keyword ticked in the table adds a line, five at most.
5. **The table**, with the tick boxes first (`TableTicks`, as on All pages and Funnel), Clear all and Select top beside
   the download, and Track at the end of each row.
6. **The eye and Ask Hakken**, on the page's own figures: see below.

## The table, on all 13 pages that share it

> Superseded the same day by the lean table (`search-console-keywords-lean-table-2026-11-17.md`): Anthony found this
> table cluttered in a narrower window and made the table rule (AGENTS.md "Tables are lean"). What follows is what was
> built first.

`SearchConsoleListScreen` is on Keywords, Pages, Tracked keywords, Tracked pages, Brand and non-brand, Almost there,
Wins and losses, Volatility, Shown but not clicked, Real against estimated, Missed demand, Pages competing and Position
bands. On each:

- **A keyword is shown whole.** It keeps today's share of the table and wraps rather than being cut short. One shared
  column (`keywordColumn`) instead of the same cell written on each page. New and lost takes it too. Page addresses stay
  cut short, with the whole address on hover.
- **Each row's move since the span before sits under its clicks and its position**, as Tracked keywords already shows it
  (`clicksAndChange`, `positionAndMove`). A table with its own column of moves (Wins and losses) keeps it.
- **The bar says the real total.** When the list is longer than the website's limit, the count is the whole list's, and
  a line beside it says how many are listed. On More Handles in October that's 26,652 keywords, with the top 25,000
  listed.

## Limits, said on the page

- Five keywords on the chart at once, as on All pages. A full table says so on the tick box.
- Each keyword ticked asks Google for its days when the chart draws it. Google allows 1,200 asks a minute for each
  website, and doesn't charge. A keyword is asked once while the page is open.
- The list's 25,000 stays as it is. It's a setting in Admin (`consoleListRows`).

## Reads

- The website's days, totals and named clicks: the read the boxes already make (`useSiteFiguresFor`), read once and
  shared by the boxes, the line and the chart.
- A keyword's days: the read its own screen already makes (`searchConsoleKeySeries`), asked once for each keyword
  ticked (`useLiveAsks`, beside `useLiveAsk`).
- The list's whole length: its summary's `rows`, and the length it was held to (`cut`), already read.

## The eye

New rules for Keywords (`convex/utils/sees/own/searchConsole.ts`, `searchConsole.keywords`), from what the page reads:

- how many clicks came from searches Google hides, out of all the website's clicks;
- the position rules already on Position bands (the top 3 and the first page against the span before, keywords that
  came onto and dropped off the first page, the band that moved most, the keywords just off the first page);
- the brand rules already on Brand and non-brand (non-brand clicks against brand, the click rate apart, the keywords
  that gained and lost most clicks);
- each ticked keyword's clicks against the span before.

Held on every period the date menu offers, on More Handles' saved figures (`searchConsolePeriods.test.ts`). The screen's
entry for Ask Hakken names the parts.

## Not in this piece

- The "Bringing them up to…" notice on finished periods (`behindOf` in `convex/searchConsoleCatchUp.ts`). It's on
  Performance too, and is best fixed once for both.
- The Device menu works as today: it asks Google.

## Size

About three developer days. Built on `dev`, not committed until Anthony asks.

## Built — 17 November 2026

Built on `dev` the same afternoon, after "Yes, build it". Not committed.

- The page: `search-console/[siteId]/keywords/page.tsx`; the chart, the ticks and the line in
  `_components/KeywordsParts.tsx`. The website's figures are read once (`useSearchConsoleSiteFigures`) and shared by the
  boxes (`SiteFiguresBoxes`), the line and the chart.
- Shared, not copied: Performance's `everyDay` and `lineOf`, All pages' `PLOTTED_COLOURS`, the kit's `DaysChart` and
  `TableTicks`. `useLiveAsks` sits beside `useLiveAsk` and asks once for each keyword ticked.
- The table on all 13 pages: `keywordColumn` replaces the same cut-short cell on ten pages (and New and lost); every
  plain Clicks and Position column is now `clicksAndChange` and `positionAndMove`; the bar counts the whole list and says
  "The table lists your top 25,000." when the list is held to the limit.
- The eye: `keywordsFindings` with its own rules, held on every period by `searchConsolePeriods.test.ts`. A ticked
  keyword ranks with the page's headlines. Keywords left the drift test's still-to-do list (29 → 28). The general-rule
  tests that used Keywords as their example now use Almost there.
- The saved outline `docs/plans/assets/search-console-redesign/look/Keywords.txt` is the new look.
- Checked in Anthony's Chrome on More Handles: every period from Last week to Last 12 months loads, with the chart's
  step changing to weeks and months, the real total (26,652 for October) and two keywords ticked. Pages and Almost there
  show the moves under their figures.

Pressed once on 17 November 2026 (Last month, Anthony's "Yes, press it"): six figures at once, then four sentences and
four steps, every figure right (5,178 hidden against 1,946 named, non-brand shown 541,260 times, up 14.9%, non-brand
clicks down 9.9% to 1,704, brand up to 242, the top 3 at 2,772 and 4 to 10 at 8,874). One model call, accepted first
time, 15 seconds, $0.027. Each step links to the page it's done on: Almost there, Brand and non-brand, Shown but not
clicked, Wins and losses.

Still to do:

- At a laptop's width the keyword column is narrow and wraps short keywords onto two lines, as the board showed. On a
  wide screen it doesn't.
