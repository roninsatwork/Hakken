# A page's "Visitors to this page": one chart in place of five

Approved by Anthony on 2026-10-20 from the drawings on the canvas "Hakken — a page's channels, alternatives"
(https://claude.ai/artifact/4j5b8zVWKJrb1iVfzszQDq, row "Visitors to this page: one chart in place of five"): "this
is nice", "can you make a plan for it", "then go". It follows the configurable chart's style, locked in the same day
(screen-kit.md, "Configurable Charts"; page-conversion-explorer-plan.md), as bars rather than lines.

## What it is

On a page's own screen (Google Analytics → All pages → a page), one card, "Visitors to this page", replaces five:

- Visits that started here, by channel (`PageVisitsByChannel`, ConversionParts.tsx)
- Visits that started here, by where they came from (in `PageStoryCharts`, PageStory.tsx)
- Where visitors went next (in `PageStoryCharts`)
- First visit or back again (in `PageStoryCharts`)
- Where visitors were just before (the `TopBars` chart on the page screen — its table of pages before stays)

It is about visitors, not conversions ("this new component is not conversion focused, it's about visitors now"):
the conversion chart above it covers conversions.

| By | The bars | Show | Split or Against |
|---|---|---|---|
| Channel (opens here) | each channel | Visits, share of visits, back again, pages a visit, read to the end | Against: the whole website (share of visits) |
| Source | each source; Google's paid and unpaid named apart | the same | Split: first visit or back again |
| First visit or back again | first visit, back again, not known | Visits, share of visits | Against: the whole website (back again) |
| Place just before | each website or page, none | Views, share of views | — |
| Page next | each page, this page again, left the website | Views, share of views | — |

- **The toolbar**: By, Show, a tick box dropdown of the bars (Select all, Deselect all; the eight biggest at first, as
  today's charts show), and Split or Against where the figures allow; every chip the same look.
- **The title follows the dropdowns**: "Visits, by channel", "Back again, by source", "Share of views, by the page
  next".
- **The bars**: the shown figure on each bar, short; sorted by it, the most first.
- **The hover**: the kit's `ChartReadoutTable`, the visits (or views) on the band with a people icon, then share,
  back again, pages a visit and read to the end where the figures have them; under the bar's row, every visit
  together, or the whole website's when set against it.

## The data — nothing new

Every figure is already on the page screen; no new asks of Google and no new storage:

- Channel: each channel's visits and the whole website's (`analyticsPageConversionGrid`); its back again, pages a
  visit and reading are its sources' together, weighted by visits.
- Source, first visit or back again, page next: the page's story (`analyticsPage` → `story.sources`,
  `story.returning`, `story.next`).
- Place just before: `analyticsPage` → `before`.

## The build

1. **Kit**: `SiteBarChart` takes a `readout` as `SiteLineChart` does; `ChartExplorer` draws bars as well as lines
   (`kind: "bars"`), the same toolbar, hover table and words; no scorecard for bars (a span's totals have no steps).
2. **The chart**: `PageVisitorsCard` (analytics `_components`), its choices per By, the channel figures from its
   sources, the words in English and Italian.
3. **The page**: the five cards out, the new card in their place; the table of pages before stays.
4. **Checks**: tests for the rule and the card, the page screen's approved outline, the screen kit guide, a look in
   Chrome.

About half a day.

## Limits, said out loud

- Only the dates chosen are kept for sources, first visit or back again, the place before and the page next: no
  "against the period before" and no line over time for them without collecting more (more asks of Google, more
  storage).
- The whole website is held for each channel's visits and for its share back again, so Against appears only there.
- A channel's back again, pages a visit and reading come from its sources: a source Google filed under no name counts
  in its channel all the same.

## Also removed — 2026-10-20

On the same go (Anthony: "then can we remove the redundant charts from the page for these two components"; "let's
remove this please"): the earlier "Visits needed for one conversion", which the conversion chart covers whole, and
"Against the other pages in {group}", the group's busiest pages' visits.

## Status

- 2026-10-20: drawn, approved and planned; being built on local dev, not committed.
