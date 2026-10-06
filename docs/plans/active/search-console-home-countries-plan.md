# Search Console keeps home countries only — plan, 2026-10-06

**Status: plan only — nothing built.** Decisions answered (below); waiting
on Anthony's "go".

Anthony, 2026-10-06, looking at morehandles.co.uk's New and lost, empty for
the United Kingdom: "why is this report empty when the UK is a home country
for morehandles"; "I'd rather lose all countries and just keep home
countries"; "this is not against this one page, it's against all pages … it's
a global rule, please make this into a plan".

## The rule

**Search Console keeps a website's home countries, and not All countries.**
Every Search Console screen reads a home country's figures: Performance,
Keywords, Pages, Countries and devices, Position bands, New and lost, Wins
and losses, Google updates, the opportunities, the breakdowns, Tracked
keywords and Tracked pages.

- **A website's home countries** are the countries on its Market list, set
  in admin (`searchConsoleCountries`, `searchConsoleCountries.ts`), up to its
  plan's `consoleCountriesPerSite`. A website with none set has one: the
  country of its place (`homeCountryOf`, `utils/researchCountries.ts`) —
  the United Kingdom when no place is chosen, as everywhere else.
- **Every screen opens on the first home country.** The country picker lists
  the home countries only (decision 2).
- **New and lost** — which reads the first- and last-seen register, kept
  until now for Web, all countries only (store less round two, F) — is kept
  for each home country instead, so it is never empty for the country a
  business sells in.
- **The other kinds of result** (Video, News, Discover, Google News), kept
  until now for all countries, are kept for the home countries instead, each
  tab shown only for a website Google has figures for (decision 3).
- **Image search is taken off** (Anthony, 2026-10-06: "I don't think we need
  to store or show data for images — we can remove this option and data
  across all pages too"): the Image tab goes from every Search Console page,
  Google is no longer asked for image figures at each collection, and the
  image figures held are cleared by the clean-out script (step 5).

## Why — measured on dev, morehandles.co.uk, 2026-10-06

Of its 205 MB of Search Console data:

| Part | All countries | United Kingdom | Shared or other |
|---|---|---|---|
| Ready-made periods (the screens' lists) | 59.5 MB | 45.5 MB | 4.5 MB (other kinds of result) |
| Search-and-page lines | 38.7 MB | 30.4 MB | 1.7 MB |
| First- and last-seen register (New and lost) | 17.8 MB | — | — |
| Page addresses, days, weeks | — | — | 7.4 MB |
| *of which Image search, all its parts* | | | *7.6 MB* |
| *Video, News, Discover, Google News* | | | *0 MB on this shop* |
| **Total** | **116 MB** | **76 MB** | **13.6 MB** |

Keeping the United Kingdom alone, with its own register (estimated 14 MB),
and no Image search, leaves **about 95 MB — under half**. Each rebuild adds up one country instead of
two, so the reading and writing that Search Console does after each
collection, weekly and on a catch-up roughly halves as well
(docs/product/search-console-running-costs-oct-2026.md).

## What changes on screen

- The figures are the home country's. For morehandles.co.uk, United Kingdom
  is about half its searches: its totals will be lower than Google's own
  Search Console shows by default, which is all countries.
- "All countries" and the countries not kept are no longer offered
  (decision 2); Countries and devices still lists every country's totals
  (decision 4).
- The Image tab is gone from every page; Video, News, Discover and Google
  News show only where Google has figures (decision 3).
- New and lost shows for the United Kingdom, and its "kept for Web, all
  countries" note goes.

## Decisions — answered by Anthony, 2026-10-06

1. **Home countries:** the countries on the website's Market list, set in
   admin; when the list is empty, the country of its place — the United
   Kingdom when no place is chosen. A website trading in three countries
   keeps three.
2. **The country picker lists the home countries only.** All countries, and
   countries not kept, are taken off it — no longer asked of Google live.
3. **Video, News, Discover and Google News show only for a website Google
   has figures for**, kept for its home countries; Google is still asked for
   them at each collection. morehandles.co.uk would show Web alone.
4. **Countries and devices keeps the small list of every country's totals**
   (well under 1 MB), so it still shows where the traffic comes from.
5. **No "Figures for United Kingdom" line** under the titles: not taken.

## Steps (about 3.75 man-days)

| # | Step | Days |
|---|---|---|
| 1 | Measure every website on dev by country (done for morehandles.co.uk) | 0.25 |
| 2 | Collection: fetch and keep the home countries' lines and the other kinds of result per home country, no Image; all countries only for decision 4's small list | 0.75 |
| 3 | Rebuilds — after a collection, weekly, catch-up on open: the home countries' periods and register, no all-countries ones | 0.75 |
| 4 | Screens: open on the first home country, the picker of home countries only, New and lost's note; the Image tab off every page; the other tabs only where Google has figures | 1 |
| 5 | Clean-out script for the all-countries lines, periods and register, and every Image figure, as for Search Console's round two; checked first that the United Kingdom's figures read the same before and after | 0.5 |
| 6 | Tests, the full local check, measure again, release on Anthony's word | 0.5 |

## Risks

- A website whose Market list is empty and whose place is wrong keeps the
  wrong country: shown on the Market page beside the list.
- A business with most of its searches abroad sees only part of them unless
  its Market list says so.
- Changing a website's home country later means collecting that country
  afresh, as adding a country to the Market list does today; how far back
  that reaches is checked in step 1.
