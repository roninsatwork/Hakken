# Search Console Performance — Way 3 with the dots (17 November 2026)

Anthony chose the board "The new page so far · Way 3 with the dots from Way 4"
on the canvas https://claude.ai/artifact/5ih8eRfFMAo69oZeA3jnXg and said
"ok lets build this" (17 November 2026). This is what gets built, from the
shared parts already on the redone Google Analytics pages, and nothing else.

## What the page shows, top to bottom

1. **Title, the kind of result, the four boxes.** As today.
2. **The day chart** becomes the shared `DaysChart` (Overview and Visits use it),
   with **Show** (Clicks, Impressions, Click-through rate, Average position) and
   **Compare with** (the span before, or No comparison). The span before is laid
   under the dates by day, as Overview does. Today's two-scale chart stays on the
   other Search Console screens that use it.
3. **Out of every 100** — the shared `HundredGrid` in a `MapCard`, as on
   Overview. **Show** (Clicks, Impressions), **Split by** (Searches, Device,
   Classification, How Google showed you), **Compare with** (the span before, or
   No comparison). Searches splits into brand searches, other searches Google
   names, and searches Google hides. It replaces today's small line about hidden
   searches.
4. **What Google shows, and what gets clicked** — the shared `HundredStrips`, as
   on Overview. **Split by** (Classification, Device), **Compare with** (Clicks,
   or Pages for Classification).
5. **Which keywords Google shows, and which get clicked** — the shared
   `DotGroups`, as on Services. **Count** (Impressions, Clicks), **Show**
   (Without brand searches, Every keyword), where each group starts across and up.
   Short axis words, as Anthony asked in his comment on Way 4.
6. **The eye and Ask Hakken**, on the page's own figures: see below.

## Limits, said on the page

- The squares name the 4 biggest groups and put the rest in "The other N".
- The bands name the 6 biggest and put the rest in "The other N".
- The dots are the 300 keywords Google showed most. A keyword with no clicks
  can't sit on the chart's scale: the line under it says how many were left off.
- Devices and How Google showed you have no figure for the span before: Google's
  lists are kept for the dates only. Their Compare with says so.
- Classification figures are every country's pages (the page fix of
  17 November 2026, `EVERY_COUNTRY_LISTS`); the chart's line says so.
- Other dates and a country the website doesn't keep ready are asked of Google,
  as the Keywords and Pages screens already do.

## Reads

- `searchConsolePerformance` (and its live twin) also return the days of the
  span before, for the chart's grey line. They read those days already.
- The page list's summary gives each Classification its impressions and its
  clicks in the span before, beside the clicks and pages it gives today.
- One new read: the 300 keywords Google showed most, with the brand split, from
  the ready-made keyword list (`searchConsoleTopKeywords`).
- Devices and How Google showed you come from the short lists the Countries and
  devices and Rich results screens read. Their hook moves out of Countries and
  devices into a shared file, as a third copy would otherwise be written.

## The eye

New rules beside today's (`convex/utils/sees/own/searchConsole.ts`):

- how many clicks come from searches Google hides, against the span before;
- the Classification whose clicks moved most, against the span before;
- the Classification Google shows far more than people click, from the bands;
- the device with the biggest share of clicks;
- the keywords Google shows most but people seldom click, from the dots.

Held on every period the date menu offers, on More Handles' saved figures
(`searchConsolePeriods.test.ts`), with a new fixture of the page's splits. The
screen's entry for Ask Hakken names the new parts.

## Not in this piece

- The "Bringing them up to…" notice on finished periods (`behindOf` in
  `convex/searchConsoleCatchUp.ts`): a fault of its own, still to fix.
- A keyword table on this page: Anthony asked for the chart only.

## Size

About three developer days. Built on `dev`, not committed until Anthony asks.

## Built — 17 November 2026

Built on `dev` the same day, after "ok lets build this". Not committed.

- The page: `search-console/[siteId]/page.tsx`, its charts in `_components/PerformanceParts.tsx`, the eye's figures in
  `_components/performanceSees.ts`. The old small line about hidden searches is gone: the squares say it.
- Reads: `daysBefore` on both Performance reads; Classification `impressions` and `previousClicks` in the list summary;
  `searchConsoleTopKeywords` in its own module, because `searchConsoleLists.ts` is at the 1,000-line ceiling;
  `useSearchConsoleSplit` shared with Countries and devices; `appearanceName` shared with Rich results.
- Three small options on shared parts, each said in a comment: `DaysChart`'s `perScale` (position weighed by
  impressions), `DotGroups`' and `SiteScatterChart`'s `formatY` (a rate of 0.4 in the hover, not 0), and log scale marks
  under 1 written to one figure (0.05 and 0.02, not "0.1" twice and "0").
- The eye: five rules (`splitFindings`), held on every period by `searchConsolePeriods.test.ts`. The writer's brief limit
  for this page went from 3,000 to 6,300 characters, as it now carries four charts' figures.
- Every read loads on every period on dev for More Handles, each in about 1.5 seconds.

`moreHandlesSearchConsolePerformanceSplits.json` was recorded again at 14:12 on 17 November, after the every-country
page refetch finished for More Handles. Each period's Classification clicks now and before are both every country's
(Last month 8,714 against 9,009; recorded mid-refetch it was 6,383 against 2,043, which made This month's Blog read as
up 148%). `searchConsolePeriods.test.ts` holds on the new figures.

Pressed once on 17 November 2026 (Last month, Anthony's "Yes, press it"): six sentences and four steps, every figure
checked, 45 seconds, two model calls on Gemini 4 Argon, $0.074. The checker had sent the first draft back partly for
typing "for every 1,000 times shown", the eye's own words for a small click rate; `typedNumbers` now accepts 1,000 after
"every", "per" or "each", as it already did 100 (Anthony: "Yes, fix it").
