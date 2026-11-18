# Search Console — Demand by Classification, Way 2 (18 November 2026)

Anthony picked Way 2 on the canvas https://claude.ai/artifact/XNKgQFWUT6L42LpHzdiqKB ("I want way 2 for demand by
classification"). On the way he renamed the page ("or demand by Classification", "rename here too") and said its
figures must follow the country menu ("the page is about the UK from the drop down above", then "the country in
scope"). The board is saved in `docs/plans/assets/search-console-demand-by-classification-way-2/`. This is what gets
built, from parts already on the redone pages, and nothing else. Nothing is built until Anthony says go.

## What the page shows, top to bottom

1. **Title and line.** "Demand by Classification". "How often Google showed each of your Classifications, and the
   clicks they got." The menu item says Demand by Classification too, for every website.
2. **Four boxes**, Performance's own: Clicks, Impressions, Click-through rate and Average position for the country
   chosen, each against the dates before ("▼ 5% fewer than September").
3. **What Google shows, and what gets clicked**: the shared `HundredStrips` (Performance, Overview). The top row is
   where 100 impressions went, the bottom row where 100 clicks went, a band for each Classification. Show picks Clicks
   or Pages.
4. **Out of every 100 clicks**: the shared `HundredGrid` (Performance). Show picks Clicks or Impressions. Compare with
   puts the dates before beside them.
5. **The table**, lean: Category (Classification on hover), Shown, Up or down, Clicks, Up or down, Pages. Find a
   Classification, and Show (Every Classification, More clicks, Fewer clicks).
6. **The eye and Ask Hakken**, on the page's own figures (below).

## The gap Google leaves

When Google splits one country's clicks by page, it leaves out the searches it keeps private. For More Handles in the
United Kingdom in October, it tied 1,946 of 7,124 clicks to a page.

The page does as Keywords does with the same gap:

- The boxes stay the country's own totals: 7,124 clicks.
- The bands, the squares and the table share out only the 1,946 clicks Google tied to a page.
- No band, square or row stands for the difference.
- The squares say "The clicks on your pages in October", never "All your clicks", over a figure smaller than the box.

No hover or sentence on this page explains the gap. The eye says it once, as Keywords' eye does.

Why: Anthony had never seen private searches on a Search Console screen. He agreed to this way on 18 November 2026
("yes i think so"). It replaces the Private searches band, squares and row the board draws.

## Reads

- **The boxes**: the website's figures for the country chosen, the read Performance makes.
- **The Classifications**: the country's pages for the dates chosen, and for the dates before, each page sorted into its
  Classification by the app's own rules (the same rules matched all 7,672 pages the app already sorts).
  - The home country's page list is kept by the collector for each ready-made period, as it was before 17 November.
    Today the collector keeps only every country's page list, which Pages reads.
  - Another country is asked of Google when it's chosen: one or two asks for each period (25,000 pages an ask).
- **Pages** in the table counts the pages in each Classification that Google showed.

## Limits, said on the page or in this plan

- Private searches can be most of the clicks, as for More Handles. It's drawn as it is.
- "Unclassified" stays as the app's word for pages not in a Classification yet.
- Last 12 months has no dates before to compare with, as Google keeps 16 months. The boxes say so, as today.

## The eye

Demand's own findings rules (`convex/utils/sees/own/searchConsole.ts`), from what the page reads:

- the Classification with the most clicks, and its share;
- the Classifications that gained and lost the most clicks against the dates before;
- a Classification Google shows a lot but people click less (the bands' gap);
- the share in Private searches, said once, plainly.

Held on every period the date menu offers, on More Handles' UK figures, in a new fixture. One real press after
building, with its cost said first, on Anthony's OK.

## Also changed by this piece

- **The page's name**, in `messages/en.json` and `it.json`, the menu and the title, for every website. Its address
  (`/demand-by-service`) stays, so links keep working.
- **Today's faults go**: the key's "The days before" and "The last days", the impressions-only chart that leaves out 3
  of 13 rows, two "Change" columns in percent, "13 services" beside "13 results", the 11-letter "Times shown"
  heading, and figures that ignored the country menu.

## Not in this piece

- Ways 1, 3 and 4. They stay on the canvas.
- Countries and devices, which waits on its own pick.

## Checks

- Tests: Private searches adds every part up to the boxes, a country other than the home one, the rename, the eye's
  rules on every period.
- English and Italian kept in step. `check:reading`, `check:words` and the table rule.
- A look test's saved outline for the new page.
- Every read loads on every period on dev (`npx convex run … --identity`) for More Handles and Ronins. Then checked in
  Anthony's Chrome at 3,200 and 1,330 wide.
- Google's quota respected: any test that would ask Google uses the pretend Google.
- GitHub's steps run here before any push. Built on `dev`, and not committed until Anthony asks.

## Size

About three developer days. Most of it is the home country's page lists in the collector, and the eye.

## Built — 18 November 2026

Built on `dev` on Anthony's "Yes, build all three", from the board and this plan. Not committed.

### What was built, and where

- **The page** (`src/app/(dashboard)/app/search-console/[siteId]/demand-by-service/page.tsx`): title and line, the four
  boxes, the bands, the squares and the lean table, top to bottom as the board draws them. Its address stays.
- **The parts** (`_components/DemandParts.tsx`): the boxes, with "5% fewer than September" and "Nothing to compare with",
  or "Google keeps 16 months" where the dates before are too old; the bands and squares on the shared `HundredStrips` and
  `HundredGrid` in a `MapCard`, as Performance draws them (`topAndRest` and its colours now shared from
  `PerformanceParts.tsx`). The figures are worked out once in `_components/demandSees.ts`.
- **The table**: Category (Classification on hover), Shown, Up or down, Clicks, Up or down, Pages, one line a row, most
  impressions first, with Find a Classification… and Show. "13 classifications" in its bar. Each row opens Pages for that
  Classification (`pages?kind=…`); Unclassified's hover says "Pages not in a Classification yet".
- **The name**, Demand by Classification, in the title and the section's menu (desktop and phone), English and Italian.
- **The home country's own pages, kept** (`countryPage`, `convex/searchConsolePeriods.ts`): each ready-made period and its
  dates before, asked of Google with the main country's filter, an ask a span (`longListRows`, `inCountry`), as the
  every-country pages aren't the country's. The short periods are asked each night, the long ones weekly; a settled
  period built before today is asked once more. Kept in the build's page book (`searchConsolePeriodTerms.ts`, moved out of
  `searchConsolePeriods.ts` to stay under 1,000 lines). Page types are kept with it only for a website with no
  Classifications.
- **The reads** (`convex/searchConsoleDemand.ts`): `searchConsoleDemand` reads the kept list and sorts each page into its
  Classification with the rules every screen shares (`readPageKinds`). `searchConsoleLiveDemand` asks Google for another
  country, other dates, or a period not kept yet: one ask for the dates and one for the dates before. Ask Hakken's read
  of the screen uses the same read, with the country's own clicks beside it.
- **The eye** (`convex/utils/sees/own/searchConsoleDemand.ts`): the Classification with most clicks and its share of the
  clicks on the pages (a new `pageClicks` measure, so it never reads as a share of the box); the Classifications that
  gained and lost most, beside the others' move; one shown a lot but clicked less than all the pages, and one clicked
  more; and once, as Keywords' eye does, how many of the country's clicks came from searches Google hides. The screen entry
  names the page's parts. The fixed line under it says the top Classification's share.
- **The readout** (`ChartTooltipRow`, shared by every chart's hover): a long line wraps onto a second line, never cut
  with "…". Short lines draw as before.

### What changed from the plan, and why

- **Private searches is gone.** The board still draws its band, squares and row. "The gap Google leaves", above, replaces
  them, on Anthony's word the same day.
- **The bands' gap is judged against all the pages' click rate.** Google ties no private search to a page, so the bands
  share out only the pages' clicks, and a Classification's click rate against the pages' is the fair test.
- **Each Classification is one row.** The old page split a service Classification into its pages. A website with no
  Classifications shows Hakken's page types, as Performance's squares do.
- **Custom dates and a period not kept yet ask Google too**, as another country does, so the figures always follow the
  dates. The old page showed the opening period's figures on custom dates.
- The old page's link to Insights' findings, its approved look (`docs/plans/assets/insights-analyst/look/ScDemand.txt`)
  and its fixture (`moreHandlesSearchConsoleServices.json`) went with it.

### Size of the kept lists

For More Handles on 18 November: about 54,000 of the United Kingdom's pages across the seven periods (2,504 this week,
6,439 last month, 13,005 the last 12 months), and about 28,000 for their dates before. About 82,000 rows in all, packed,
under 1 MB, worked out from Google's answers. Seven asks a night for the short periods, and about seven a week for the
long ones.

### Not done, or waiting

- **Nothing is kept on dev yet.** The lists are built at More Handles' next nightly settle (the short periods) and the
  weekly one (the long). Until then the page asks Google, two asks a period. Nothing was rebuilt by hand.
- **One real press of the eye**, which waits on Anthony's OK.
- **Checked in Anthony's Chrome at 1,440, 1,330 and 3,200 wide**: not yet.
- **Ronins' reads**: the identity used holds More Handles' company only.
- **`scripts/word-style-allowlist.json`** still lists four lines that are gone (`searchConsole.seen.services.shownMore`
  and `shownFewer`, `searchConsole.services.chart.before` and `chart.now`), so `check:words` asks for them to come off.
- **The writing guide's table of redone screens** should gain `searchConsole.services`.
- Keywords also has a line under its boxes saying how many clicks came from searches Google names. This page has none.

### Checks run

- `npx vitest run` on every Search Console test, the eye's, the kit's screens and charts, Google Analytics', Sites' and
  every drift test: 245 files, 2,216 tests, all pass. New: Demand by Classification on all seven periods in
  `convex/utils/sees/searchConsolePeriods.test.ts`, on a new fixture (`src/test/fixtures/moreHandlesSearchConsoleDemand.json`);
  the collector's home-country pages, the kept read and another country's ask in `convex/searchConsoleCountriesKept.test.ts`;
  the screen and its saved look in `src/app/(dashboard)/app/search-console/searchConsoleLookDemand.test.tsx` and
  `docs/plans/assets/search-console-demand-by-classification-way-2/look/Way2.txt`; the readout's wrap in
  `src/ui/components/charts/ChartTooltip.test.tsx`.
- `npm run typecheck`, `npm run lint` on the changed files, and every guard pass. `check:words` fails only on the four
  allowlist entries above.
- Every read loads on every period on dev for More Handles: `searchConsoleDemand`, `searchConsoleLiveDemand`,
  `searchConsolePerformance` and Ask Hakken's screen read.
- Google was asked 12 times, once for each period and its dates before, to record the fixture. Each answered in one
  request.

## Checked — 18 November 2026, afternoon

- **The eye, pressed twice** on Last month for More Handles (about 4 US cents each). Its figures were right, and it said the searches Google hides once (72.7% of the clicks). The first press had two faulty steps, both fixed:
  - "since the 28 days before" for Last month. The eye now has the months' names (`SearchConsoleSees`), and says "since September".
  - The Brand Classification's pages were sent to Brand and non-brand, which is about searches naming the website. The screen entry now forbids that step, and the second press sent them to Pages.
- **Ask Hakken, three questions**: the Classification shown a lot but clicked least (Other Ironmongery, 2 clicks for every 1,000 times shown), why the Classifications add up to less than the boxes, and how many UK clicks Google ties to a page. The second answer gave the right reason with no figure, so Ask Hakken's read now carries both sides of the gap (`clicksOnPages`, `clicksFromSearchesGoogleKeepsPrivate`, `convex/assistantSearchConsoleReads.ts`). The third then said 1,946 clicks, each Classification's, and 72.7% hidden. The answers read like reports. That's Ask Hakken's own style, proposed as a task of its own.
- **Anthony's Chrome at 1,348 wide and at 3,200** in a frame of that width: no sideways scrolling, headings on one line, and the bands 224 pixels tall with 12-pixel words at both.
