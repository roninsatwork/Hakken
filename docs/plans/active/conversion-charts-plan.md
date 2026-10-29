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
- **Not built tonight**: the screen a square opens (the pages behind it; squares carry no link yet); page kind a day
  at a time (landing pages are kept for the period, not by the day: the lines by kind offer channel, device and
  country); the same parts on Channels, Visitors and a page's own conversions.

## Open

- The line, "Visits needed for one conversion": the rate by day or visits per converting visit; what is
  ticked at first (Purchase alone?). Board 2 on the canvas.

## Change log

- 2026-10-29: written from the canvas discussion; the Conversions map agreed as a standard part.
