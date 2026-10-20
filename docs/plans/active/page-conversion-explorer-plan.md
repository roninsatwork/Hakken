# A page's "Visits needed for one conversion", by channel and conversion

Approved by Anthony on 2026-10-20, from the drawings on the canvas "Hakken — a page's channels, alternatives"
(https://claude.ai/artifact/4j5b8zVWKJrb1iVfzszQDq, row "Visits for one conversion: one chart, every dimension",
board A, the toolbar): "go with channels please, I want it as per the design".

## What it is

On a page's own screen (Google Analytics → All pages → a page), under the page's earlier "Visits needed for one
conversion", one chart titled "Visits needed for one conversion, by channel" (Anthony, 2026-10-20: "can you put this
chart back to what it was … then we add this new chart in additional under this one"; "do the rename now please"):

- **Show**: visits for one conversion, conversions, visits, or conversion rate.
- **Conversions**: a dropdown of tick boxes, one for each counted kind of conversion (`TickSelect`, new to the kit).
- **Channels**: the same, one for each channel whose visits started on the page; AI assistants by their source.
- **Lines**: a line per channel, a line per conversion, or one line for everything ticked.
- **Against**: nothing, the period before, or — for 12 months only — the same dates last year (dashed). A year ago
  only weeks and months are kept, so shorter dates a year before would be read from weeks and months that miss them.
- **The step follows the dates at the top of the page**: days for 7 and 30 days, weeks for 90 days, months for 12
  months (Anthony: "this should be automatic from the date range"). The chart has no dates or step of its own, and
  no chart-type switch ("remove this").
- **Better or worse**: under the chart, for each line — the latest whole step against the one before, the last three
  against the three before, and the last three against the same three a year before. A step still going (this month,
  this week) is left out.

Google Analytics' figures only, as every Google Analytics screen (no Search Console, Clarity or rivals).

## The data

A page's days were kept as a whole, not by channel. Two new lists of each page over time
(`googleAnalyticsPageSeries`, `CHANNEL_SERIES_LISTS`):

- `landingChannel`: the visits that started on the page and each counted kind's count, by Google's channel.
- `landingAssistant`: the same for the assistants' sources only (ChatGPT, Perplexity …), by the channel Google filed
  them under — taken out of that channel and counted as AI assistants when read, as Channels does.

Kept the same way as a page's other records: a day for 90 days, a week to 12 months, a month to two years, nothing
older. **Every device only**: a page's records by device times its channels would be the store's biggest, so when a
device is chosen the chart says it shows every device's.

### How it is collected

- **Each night**: the run adds each page's new days by channel beside the other two lists (`collectPageDays`), two
  more asks of Google a piece of days. `pageChannelsFrom` on the connection (and each home country) says the first
  day kept by channel.
- **A new website's first night**: the page fill asks the lists by channel with the other two, so its two years by
  channel are there from the start.
- **A website filled before this**: a channels-only page fill, asked only of the lists by channel, **run by hand on
  Anthony's go**, after reading the property's allowance (the quota rule):
  `npx convex run googleAnalyticsSteps:fillPageHistory '{"connectionId": "…", "channelsOnly": true}'`.
  Until it has run, the chart shows the days kept since the first night, and says from when.

## After the audit — 2026-10-20

Anthony asked for an audit ("it looks buggy"); the figures by channel matched the page's own totals by channel (7 and
30 days to within 8 visits, 90 days within 1%, 12 months within about 2.5%), and the home page's paid visits really did
fall from about 26 a day to about 2 from 7 October, while the whole website's did not. Fixed on his "fix all":

- The readout read a day with no conversion as 0: it reads "–", with each line's visits and conversions beneath.
- "The same dates last year", and the scorecard's "against a year before", only for 12 months.
- A week or month the dates cut (the newest, still going, and the first) is marked as part of one: an open ring,
  its hover naming its days, as Search Console's chart.
- Each channel keeps its colour whatever else is ticked, in Channels' colours; Channels' fourth colour is teal, not
  an amber that read as the busiest channel's orange (both screens).
- A line breaks on a day with no conversion rather than joining across it; a day alone between two gaps is a dot.

## The hover — 2026-10-20

Drawn on the canvas (row "Hover B, following the dropdowns") and built on Anthony's "build it": a small table on a
wider hover panel (`ChartTooltipSurface wide`, this chart only; `SiteLineChart readout`), in `ExplorerReadout.tsx`.
A row a line (channel, kind of conversion, or everything ticked) and their total; visits (said once above the rows
for a line per kind), the conversions bold on their own band with a target, and visits for one — or the rate when
Show is the rate; a short line marks the column the chart draws; against a span, "was …" under each figure and the
span's dates in the heading. The app's standard 13px ("why is the font not our standard size … this is huge"); every
line ticked keeps its row, noughts shown ("I want to show 0s still for the hover — don't truncate it like this").

## Locked in as the kit's style — 2026-10-20

Anthony: "I think this is great, let's lock this in as a component style" ("reusable part"; "go"). The chart is now
drawn by the kit's `ChartExplorer` (`src/ui/components/screens/ChartExplorer.tsx`), its hover by
`ChartReadoutTable` (`src/ui/components/charts/`), and its shared rule — steps, whole steps, a year before, better or
worse — is `chartExplorerRule.ts`; this chart keeps only its own figures (`explorerRule.ts`, `ExplorerReadout.tsx`).
The rules are written in screen-kit.md, "Configurable Charts", and both parts are in the drawing kit. It opens on
Conversions ("default this to conversions so we always show a full graph").

## Limits, said out loud

- Every device only, as above.
- New against returning visitors within a channel is not kept, so it is not a dimension.
- A channel or kind with no conversion in a step has no "visits for one conversion" there: its line skips it.

## Status

- Built on local dev 2026-10-20, not committed: the lists, the nightly collection, the fills, the read
  (`googleAnalyticsPageChannels.ts`), `TickSelect`, the chart (`ConversionExplorer.tsx`, its rule in
  `explorerRule.ts`), tests, wording in English and Italian, the page screen's approved outline.
- Waiting on Anthony: the channels-only fill for websites already filled (Hurtwood House first).
- The backend read the earlier chart used (`analyticsPageVisitsPerConversion`) is no longer read by any screen; it can
  go in a later tidy.
