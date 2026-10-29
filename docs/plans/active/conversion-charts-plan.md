# Conversion charts: the Conversions map and the line

*Started 2026-10-29 from the canvas "Conversion charts"
(https://claude.ai/artifact/PhMdvFTTCamXfkdB4aBahX). Recorded, not yet approved to build. Dated record; later
decisions go in the change log, never by editing the record.*

## Why

Anthony, 2026-10-29, on Conversions' grid: "4,227 people added to basket and only 235 purchased … is that
correct". It was not: Hakken copies Google's unit per event, so Purchase counts visits and Added to basket
counts times. "I don't want the chart by the times it happened, that's meaningless." The same fault inflates
"Visits needed for one conversion".

## Decisions (2026-10-29)

1. **One part, the Conversions map**, standard and shared: Conversions, Channels' map, Visitors' grid, a
   page's conversions by channel. Board 1b on the canvas is the drawing; the spec board beside it is the rule.
2. **Count**: Visits (the start; visits that did it), Conversion rate (visits that did it over visits that
   landed on that kind, in %), Events (times; never a rate).
3. **Columns**: Page kind, Channel, Device, Country. **Compare**: Nothing, or the month before (a small up or
   down mark under each number).
4. **The controls are the chart toolbar** every card uses: three dropdowns under the heading, left-aligned
   (his choice of three drawn options: dropdowns, a sentence, a page-level view switch).
5. **Heading**: "Conversions". No sentence under it. Hover a column heading for its full name.
6. **Rows that never happened** are not drawn; one line names them.
7. **A square opens the pages behind it** (board 1c), best first, with a way back.
8. **Wording**: short sentences, everyday words, the number before how it was made. Nothing on a chart card but
   its heading, the dropdowns, the chart and the key.
9. **One line fills** (every line chart in Hakken): when exactly one line is shown, the area under it is filled in the
   line's colour fading to nothing at the axis; two or more lines stay bare.
10. **The second shared part, Conversions over time by kind**: a line a day per page kind, channel, device or
    country for one conversion, the same dropdowns, a tick box per line, names that open the pages.
11. **The line, Conversions over time** (board 2b): Conversion one at a time (Purchase first), Show the conversion
    rate or visits per conversion, Compare nothing or the month before. No tick boxes, no kinds added together.

## What the build must collect

- Visits for every event (Google's `sessions` per event), not Google's own once-a-visit setting; the nightly
  runs re-ask the running periods and finished periods are re-fetched; the kept days get one backfill.
- Conversions by channel, device and country per kind (channel × event lists).
- Each square's figure for the span before.

## As built (2026-10-29, evening; Anthony: "I want them added to the pages so I can check in the morning")

- **Both numbers kept for every conversion**: each stored row now carries each event's visits (Google's
  `sessions` with the event) and its times (`eventCount`) beside the count every older screen reads
  (`eventVisits`, `eventTimes` on `analyticsPackedRows`; `googleAnalyticsLists.ts`). Nothing else in the
  section changes. A row kept before tonight carries Google's own count only, which stands in for both until the
  01:00 run replaces the running periods' lists; finished periods follow when they are next fetched.
- **The reads** (`convex/googleAnalyticsConversionsMap.ts`): `analyticsConversionsMap` (each conversion by page
  kind, channel, device or country, in both units, with the span before) and `analyticsConversionsByKindChart`
  (one conversion a day, a line per channel, device or country). `analyticsChart` and the span-before chart carry
  both units per day for the single line.
- **The three parts** in the screen kit: `ConversionsMap` (on `ChannelMap`, which gained a square's own words,
  a note, a link, its own share, and headings that say their full name in the app's tooltip),
  `ConversionsByKindChart` and `ConversionsOverTimeChart` (on `SiteLineChart`). `SiteLineChart` now fills
  the area under a lone line on every line chart (decision 9).
- **On Conversions** (`ConversionsCards.tsx`): the map, the lines by kind and the line over time in place of
  "Conversions by page classification" and "Visits needed for one conversion". Each card's choices live in the
  address (`mapCount`, `mapBy`, `mapCompare`; `linesEvent`, `linesCount`, `linesBy`; `timeEvent`,
  `timeShow`, `timeCompare`).
- **Responsive, and hover as standard** (Anthony, 2026-10-29, at a 450px card: "still very unreadable"; "add hover
  states to each grid item as standard"): where a square would be under 60px, the map becomes a list for one
  conversion at a time, chosen from a dropdown, each kind as its full name, a bar and its figure; wide, the grid, whose
  headings truncate with the full name in the app's tooltip and whose every square says its words in the same tooltip
  (`ChannelMap`'s `headingTooltips` and `cellTooltips`).
- **Later the same night** (Anthony: "ok finish the code now and we can review when the data comes in, in the morning"):
  - **A square's hover** stays on the screen (the app's `Tooltip` moves in from either window edge, measured once) and
    reads deeper, not wider: three lines — the conversion and the kind, the figure (with its visits for a rate), the
    month before when compared — wrapping at 14rem.
  - **The pages behind a square** (`/app/analytics/[siteId]/conversions/pages`, read `analyticsConversionsPages`):
    every square links to it, carrying the Conversions screen to come back to. It lists the landing pages of the
    square's column on which a visit that made the conversion landed — page, visits, converted (visits), times, rate —
    the most conversions first, with search, sorting headings and numbered pages; a page opens its own screen and
    comes back. **Limit: the 500 pages with the most conversions** (`MOST_SQUARE_PAGES`); past it the screen says so.
    A page kind's column reads the landing pages with the map's own fold (the 8 busiest kinds, the rest Other); a
    channel's reads the landing pages by channel; a device's or a country's reads that device's or country's landing
    pages. Its What Hakken sees (`conversionPagesSees`): how many pages made how many conversions, the page that
    made most, the busy page converting least (50 visits or more, never an older row with more conversions than
    visits), and a step to the best page.
  - **A page's own conversions by channel** (All pages → a page) is the Conversions map now, with Count and Compare
    (`pageMapCount`, `pageMapCompare`): `analyticsPageConversionGrid` carries both units and the span before.
  - **Page kind a day at a time**: a new day list, `landingKind` (`DAY_ONLY_LISTS`), collected with the other day
    lists every night — the landing pages asked by day and device and **added up by the website's classification as
    they arrive, a row a kind, never a row a page**, so a 10,000-page website's day is a dozen rows. Kept as days only:
    never rolled into weeks or months, never filled back two years; a day past 90 goes. One more Google ask a night
    for each website and home country. The lines by page kind read it and fold as the map does; a day keeps the
    classification as it stood the night it was collected (classifying a page later changes the map, which
    classifies at read time, but not the days already kept). Nothing is held until the first 01:00 run after
    2026-10-29, so the lines by page kind say "No days are held" until then.
- **Still to come**: the same parts on Channels and Visitors.

## Open

- The line, "Visits needed for one conversion": the rate by day or visits per converting visit; what is
  ticked at first (Purchase alone?). Board 2 on the canvas.

## Change log

- 2026-10-29: written from the canvas discussion; the Conversions map agreed as a standard part.
- 2026-10-29, night: the pages behind a square, a page's conversions by channel on the map, the landing pages by kind
  kept a day at a time, and the deeper hover; see "Later the same night" under As built.
