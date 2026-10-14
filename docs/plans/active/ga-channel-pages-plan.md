# Google Analytics — Channels and a channel's own page, rethought

**Planned 2026-10-13. Status: built 2026-10-13, all ten phases, local on `dev`
(see "Built" below).** Drawn on the canvas
[Google Analytics — one channel](https://claude.ai/artifact/SDnjxUTrJR1RYQHW4ySDnc)
(nine boards, a copy in [docs/plans/assets/ga-channel-pages/](../assets/ga-channel-pages/)),
reworked through 26 comment threads the same evening. Anthony, on the last round:
"i think this is really good — we need to make this into a document repo plan".
The drawing is the binding look (screen-kit.md, "Approved Looks"). Change a
decision here, with a date, before building anything that disagrees with it.

## Why

Anthony, 2026-10-13, on a channel's own screen (Direct, Organic Search…):

- "what is it meant to do / Why do we need it / What else can we do with it,
  we store loads of info — maybe page classification by channel… maybe
  conversion by channel… there must be more"
- On the first drawing: "all of the pages in the canvas are a bit boring, no
  graphs, not real intelligence, no channel by classification or anything I
  asked for" — "don't just do as I ask, add value by suggesting things… be the
  super brain you're supposed to be"
- "this is in the google analytics section so its google analytics data only"
- "remember these are pages for any website not just ronins so the features
  need to work globally for everyone"
- "and the channel overview page too we need to make a stronger UX"
- "All sub pages need a graph over time thing" — "Otherwise how do we know if
  it's growing or shrinking"

**What the screens do today.**
- **Channels**: What Hakken sees, "Visits a day by channel", a "Visits by
  channel" bar chart, then the channels table.
- **A channel's own screen**: What Hakken sees, four figures, and one table of
  the channel's sources. For Direct that table is a single row, "(direct)",
  repeating the figures above it.

Nothing says where a channel's visitors land, what kind of page converts them,
which pages won or lost its visits, or whether the channel is growing.

## 1. Decisions

- **CH1 — Google Analytics data only, for any website.** Every figure, chart
  and sentence comes from what the Google Analytics section stores, plus
  Hakken's page classifications and Google's update dates, which its charts
  already carry. Nothing from Search Console, Clarity or Discovery. Every
  reading in What Hakken sees is a fixed rule over that data (§4). It works
  for any connected website, and it says nothing when a website's figures
  can't support it. No AI cost.
- **CH2 — One page for every channel.** Organic Search, Direct, Referral,
  Organic Social, Paid Search, Email, Unassigned and AI assistants all open the
  same page, top to bottom:
  1. Header (unchanged).
  2. What Hakken sees, with up to three Do first steps, each linking to where
     to act.
  3. One row of four figures (CH3).
  4. The channel over time (CH4).
  5. Where it lands, by page classification (CH5).
  6. The pages behind the change (CH6).
  7. The table, with its controls row and four views (CH7).

  AI assistants adds its own parts (CH8).
- **CH3 — The four figures.**
  - **Visits**, against the span before.
  - **Conversions**, beside the whole website's rate ("7.5% of visits ·
    website 1.2%").
  - **Conversions it started**: conversions by people this channel first
    brought, on that visit or any later one, even if they came back another
    way (Google's first-user channel), with the span before.
  - **Dwell time**: engaged time a visit, beside the website's, with the
    channel's engaged share.
- **CH4 — "<Channel> a day, against the span before".**
  - **Lines.** The channel's line, the span before as a grey dashed line, and
    a dot on each day with a conversion, bigger for more, named in the legend.
  - **Measure switch.** Visits · Dwell time · Conversions.
  - **Dates.** It follows the page's dates and Daily / Weekly / Monthly.
  - **Google updates.** Google's mark where it released an update. The
    update's name shows only on hover, and the legend has no item for it.
- **CH5 — "Where <channel> lands, by page classification".**
  - **Bars.** One horizontal bar a classification, with the span before as a
    grey bar under it.
  - **Classifications.** The website's own classifications, or Hakken's page
    kinds while it has none. "No page recorded" gets its own bar.
  - **Hover.** The visits and conversions, both spans.
- **CH6 — "The pages behind the change" (ChangeBars).**
  - **Layout.** Two columns either side of a centre line ("◀ Lost visits ·
    Gained visits ▶").
  - **Gains** run right in orange, with the page and its move to the left of
    the line ("/hub/kapferer-brand-identity-prism/ ▲ 8 · 9 → 17").
  - **Losses** run left in grey, with their words to the right of the line.
  - **Which pages.** The four biggest gains and the four biggest losses.
- **CH7 — The table and its controls.** The controls row is the standard one
  that All pages and Landing pages use: the search box first, then filter
  chips (named only until chosen, each list opening on "Every …"), then the
  view switch, names only.
  - **Landing pages.**
    - **Filter:** Classification.
    - **Columns:** Page (title over address, with its classification),
      Visits, Bounce, Pages, Time, Conversions, Change. The same columns as
      Landing pages.
  - **Classifications.** Classification (with its page count), Share of
    visits, Visits, Bounce, Time, Conversions, Change.
  - **Key events.**
    - **Which events.** Every key event of the property, counted as a
      conversion or not, with zeros shown.
    - **Filter:** Key events (Counted / Not counted).
    - **Columns:** Conversion (Counted / Not counted, as a StatusLabel),
      Times, Change, Value, Landed on.
    - **Chart above the table:** "Key events a day", every key event in its
      own colour.
  - **Sources.** Today's table, kept, with "Each source a day" above it. A
    channel with one source, such as Direct, has no Sources view.
- **CH8 — AI assistants' own parts.**
  - **Who counts.** Every assistant by its own name, whichever channel Google
    filed it under (the existing GA10 rule).
  - **Figures.** Visits, Conversions, Conversions it started, and **Filed
    elsewhere**: the share of their visits Google filed under Referral or
    Unassigned.
  - **"AI assistants a month".** Stacked columns by assistant. It follows the
    dates and Daily / Weekly / Monthly, with Google's marks.
  - **"Each assistant's visits, by how Google filed them" (FiledBars).**
  - **Where they land.** CH5 for all assistant visits, once phase 9 collects
    landing pages by source.
  - **Table.** Assistant, Visits, Filed elsewhere, Engaged, Conversions,
    Value, Change, with a "Filed as" filter.
  - **Dates.** Opens on **Last 30 days**, like every other page (Anthony,
    2026-10-13).
- **CH9 — The Channels overview.**
  - **What Hakken sees** compares the channels, with Do first linking into a
    channel's page.
  - **Figures.** Visits, Conversions, **Converts best** (the channel and its
    rate beside the website's), and **Key events not counted** (CH12, R3).
  - **"Visits a day by channel".** As today: four lines and the rest as one,
    plus conversion dots and Google's marks.
  - **"Where each channel lands, by page classification" (ChannelMap).**
    Channels down the side, classifications across. Each square is the
    channel's visits that landed there, brighter for a bigger share of the
    channel, with its conversions. A key underneath says what the numbers and
    shades mean.
  - **"What a visit is worth, by channel".**
    - **Span.** Always the last 12 months, so small channels have enough
      visits to judge.
    - **Bars.** Each bar is conversions out of visits; orange when it beats
      the website.
    - **Hover.** The rate, and £ a visit: conversions' value ÷ visits, valued
      as in Google Analytics, or in Hakken's conversion settings where
      Analytics has no value. The chart's own words say so.
  - **Table.** Channel, Visits, Dwell time, Conversions, Started, Change,
    Lands most on, with a "Lands most on" filter. Each row opens its channel's
    page.
  - **Removed.** Today's "Visits by channel" bar chart goes.
- **CH10 — Bars on these pages.** The app's bar sizes (SiteCharts.tsx: 24px
  bars, 4px between a row's bars, 16px between rows, 3px corners, 11px
  labels). Hover carries every figure, and a value axis sits underneath. **No
  numbers or words on or beside a bar** (ChangeBars keeps its page names).
  Only these pages; other screens' bar charts stay as they are until Anthony
  asks (2026-10-13).
- **CH11 — Three new screen-kit parts**, named and approved 2026-10-13:
  **ChangeBars** (CH6), **ChannelMap** (CH9), **FiledBars** (CH8). Each is
  built once in `src/ui/components/screens/`, added to the drawing kit
  (`scripts/drawing-kit/parts.tsx`), and given its own tests. The conversion
  dots and Google's marks are already in `SiteLineChart`.
- **CH12 — What Hakken sees: the rules.** Each is a sentence (and sometimes a
  Do first step) that appears only when its rule fires, worded in
  `convex/utils/sees/`. Every threshold below is Hakken's, said here so it can
  be changed.
  - **R1 — Where the change went.** The classification that gained the most
    visits and the one that lost the most, against the span before.
  - **R2 — A converting page losing visits.** The page with the most
    conversions in the span before, whose visits fell by 20% or more. Do
    first: win them back, linking to the page's own screen.
  - **R3 — Key events not counted.** A key event not counted as a conversion
    that happened in the dates. The reading follows **Tracking health's
    verdict** (conversion-checks-plan.md):
    - If the check "an enquiry happening but not counted" names it, Do first
      says count it.
    - If the check "a conversion is really something else" names it, the
      reading says what it really is and never suggests counting it.
  - **R4 — No page recorded.** Visits with no landing page over 5% of a
    channel's visits (`UNKNOWN_SHARE`, as Tracking health). The reading gives
    the engagement without them; Do first links to Tracking health.
  - **R5 — Lost sources on Direct.** Direct's people new to the website at
    70% or more: "most of these are links whose source was lost". Do first:
    tag your links (Campaigns).
  - **R6 — AI assistants filed elsewhere.** The share of assistant visits
    outside Google's AI Assistant channel, when any.
  - **R7 — Growing over the year, falling now.** The last 90 days below the
    90 before and below the same 90 a year ago, while the 12 months rose.
    Any channel. ronins.co.uk's AI assistants: 23, against 61 and 80.
  - **R8 — Converts best.** The channel with the best conversion rate over 12
    months, among channels with 100 visits or more (`FEW_VISITS`).
  - **R9 — Conversions it started.** A channel that started at least 2 more
    conversions than it finished: "it introduces buyers who come back another
    way".
- **CH13 — Data: one new kept list (phase 9).** Landing pages by source, for
  AI assistant sources only (the assistants list in
  `convex/utils/aiAssistants.ts`). It's collected with the existing run, at no
  cost. Then the AI assistants page's classification chart, Landing pages and
  ChannelMap row cover every assistant visit, not just the ones Google files
  as AI Assistant (ronins.co.uk, 12 months: 254 visits against 49).

## 2. What it showed on ronins.co.uk (real figures, 13 Oct)

United Kingdom, last 30 days to 12 Oct unless said.

- **Organic Search.**
  - **Visits and conversions.** 192 visits, up from 150, but no conversions,
    down from 3.
  - **Where the change went.** The growth went to Content hub articles (29 →
    53) and to visits with no page recorded (15 → 32). Service pages fell (83
    → 69).
  - **The page behind it.** /ai-agency/ made 2 of the 3 conversions and fell
    from 49 visits to 33.
  - **Engagement.** 76.0%, but 90.6% without the visits with no page.
- **Direct.**
  - **Conversions.** 40 visits made all 3 of the website's conversions, every
    one from the home page.
  - **New people.** 27 of its 30 people were new to the website: lost
    sources.
- **AI assistants, 12 months.**
  - **Visits.** 254, up from 168, but falling now: 23 in the last 90 days.
  - **Conversion rate.** 5.9% of their visits converted, against 1.5% for the
    website.
  - **Filed elsewhere.** 180 of ChatGPT's 221 visits sat under Referral or
    Unassigned.
- **Channel map, 12 months.** Organic Search → Service made 30 conversions
  from 1,372 visits. Organic Search → Content hub made none from 1,002.

## 3. What Hakken already holds, and what is new

| Part | Held today? | How |
|---|---|---|
| A channel's visits, engaged, views, time, people, new people, every key event's count and value | Yes | The channel list (channel × source), per period and per device |
| A channel by day, with conversions and engaged time | Yes, 60 days | `googleAnalyticsDays` (channel) — up to 30 days drawn from it |
| A channel by day for 90 days / 12 months | Asked when the screen opens | The live channel series (`channelSeriesAsk`) — extended to one channel, with conversions and dwell time |
| Each source a day, each key event a day | Yes, 60 days | The same days; longer spans asked live, as above |
| Landing pages by channel, now and before | Yes | `landingChannel` |
| Conversions it started | Yes | `firstChannel` |
| Classifications | Yes | `pageKinds` / `pageClassifications`, as Landing pages' groups |
| Google's update dates | Yes | `googleUpdates` |
| Landing pages by AI assistant source | **No** | Phase 9: a new kept list, AI sources only |

## 4. Phases and size

Estimates are man-days, as a developer would take. Each phase stops for
Anthony's go before the next.

| Phase | What it does | Man-days |
|---|---|---|
| 0 | **Lock the look.** This plan and the nine boards saved; look tests planned per screen. | 0.5 |
| 1 | **The reads.** One channel's figures (with Conversions it started and dwell time), its landing pages with classifications, its classifications now and before, every key event with where it landed, the pages behind the change, the channel map and what a visit is worth: tenancy-scoped, tested. | 3 |
| 2 | **Charts over time.** One channel a day against the span before (visits, dwell time, conversions); each source a day; each key event a day; 90 days and 12 months asked of Google live; AI assistants by assistant. | 3 |
| 3 | **The new parts (CH10, CH11).** ChangeBars, ChannelMap, FiledBars; the measure switch on the day chart; hover-only bars with a value axis on these pages; the drawing kit; tests. | 2.5 |
| 4 | **The channel page (CH2–CH7)** for every channel: figures, charts, four views, the controls row, filters, English and Italian. | 3 |
| 5 | **AI assistants' own parts (CH8).** | 1.5 |
| 6 | **The Channels overview (CH9).** | 2 |
| 7 | **What Hakken sees (CH12):** rules R1–R9 with their Do first links on all three pages, Ask Hakken reading the same box, Tracking health joined for R3, Italian. | 2.5 |
| 8 | **Proof.** Look tests against the boards, drift tests, the full gate with GitHub's steps, ronins.co.uk and a larger client's real data checked in Chrome. | 1 |
| 9 | **Landing pages by source for AI assistants (CH13).** The new kept list, collected with the existing run, and the AI page and map reading it. | 1 |

**Total: about 20 man-days.** Phases 1 and 3 to 8 use only what Hakken already
holds. Phase 2 extends today's live chart ask. Phase 9 is the one new kept list.

## 5. Risks

- **Thin websites.** Small websites have days with nothing on them. The rules
  keep quiet below their thresholds, and conversion rates under 100 visits stay
  greyed, as today.
- **Google withholds small numbers.** Very small lists can come back folded or
  thresholded. The screens say so, as Landing pages does.
- **Slower first open for long spans.** 90 days and 12 months by day are asked
  of Google when the screen opens (about a second). The figures and tables show
  at once and the lines fill in.
- **Two bar styles in the app.** These pages are hover-only (CH10); other
  screens keep their labels until Anthony asks.
- **Phase 9 adds rows.** Landing pages by source stays small because it's
  limited to AI assistant sources.

## 6. Questions — answered by Anthony, 2026-10-13

1. **Collect landing pages by source for AI assistants (phase 9)?** "Include
   it".
2. **New kit parts named ChangeBars, ChannelMap, FiledBars?** "Yes, those
   names".
3. **Hover-only bars for every chart in the app, or only these pages?** "Only
   these pages".
4. **The AI assistants page's opening dates?** "Last 30 days", like every page.

Settled in the canvas's comments the same evening:
- **Over time.** Every sub-page has a chart over time, following the page's
  dates.
- **Google's updates.** The mark stays; the name shows on hover, with no
  legend item.
- **Bars.** The app's thickness, with no numbers on them.
- **Key events.** Every key event is shown, counted or not.
- **Controls row.** It follows All pages: search, chips, then the switch.
- **Conversion dots.** Kept ("love it").
- **The channel map.** Kept ("love this"), with its key.

## Built — 2026-10-13

All ten phases, the same evening Anthony said "i love it lets build it".
Checked on ronins.co.uk's real figures in Chrome; the full gate's results are
in the session's hand-over.

- **Reads** (`convex/googleAnalyticsChannelReads.ts`): `analyticsChannelTop`,
  `analyticsChannelEvents`, `analyticsChannelDays`, `analyticsChannelsTop`;
  the rules in `convex/utils/sees/analyticsChannel.ts`. Longer spans and other
  countries ask Google once, now and the span before each on its own
  (`askGoogleAnalyticsLive`, `before`).
- **Channel table views** reuse the Analytics list read: a channel's landing
  pages and classifications (`channel` on `landing`/`groups`), AI assistants'
  "Filed as" filter and Filed elsewhere (`filed`, `elsewhere`), Channels'
  Started and Lands most on (`extras`).
- **Screens**: `channels/page.tsx`, `channels/channel/page.tsx` and
  `channels/_components/`. Looks locked in `look/` beside the boards
  (`channelPagesLook.test.tsx`); the old Channels and ChannelSources looks
  (`google-analytics/look/`) are retired.
- **Kit**: `ChangeBars` and `ChannelMap` in `src/ui/components/screens/`, in
  the drawing kit and screen-kit.md. **FiledBars is `SiteBarChart` stacked
  along**, not a part of its own — the stacked bar already does it.
- **Charts**: `SiteLineChart` gained `markLabel` (the dots named in the
  legend), `formatValue` and `formatScale`; `SiteBarChart` gained `faded` (the
  span before on Key events a day); both gained `updateKey` (CH4, CH10).
- **Ask Hakken** reads the same parts for Channels and a channel's page, and
  the box's advice is saved with page groups by name.
- **Phase 9** (CH13): the new kept list `landingAssistant` — each landing page
  by Google's channel and the assistant's source, only AI sources asked of
  Google (`AI_SOURCE_VALUES`). `landingByChannel` credits every assistant
  visit to AI assistants once, taking it out of the channel Google filed it
  under; until the next collection keeps the list, Google's AI Assistant
  channel stands for them and the chart says so.

Where the build reads differently from the plan, as decided while building:

- **Landing parts are every device's** when a device is chosen, as
  `landingChannel` and `firstChannel` are kept; the charts and tables say so.
- **Page groups** without the website's own classifications are Hakken's page
  types (`SERVICE`), as every other screen names them (`usePageKinds`).
- **What Hakken sees keeps three sentences**: a channel's own finding (Direct's
  lost sources, falling now, filed elsewhere) comes before where the change
  went, which comes before a key event not counted unless Tracking health
  reads it as an enquiry.
- **AI assistants** show their monthly columns, where they land and FiledBars
  in place of the day chart and the pages behind the change, as drawn; the
  table opens on Assistants.
- **What a visit is worth** keeps a channel under 100 visits grey, never
  orange, and says why on hover (GA22).

## Change log

- 2026-10-13 — Built, all phases (see "Built"). R3 no longer names
  ronins.co.uk's "Form sent" as link clicks: Tracking health now reads it as
  an enquiry not counted.
- 2026-10-13 — Planned from the approved canvas and its comment threads.
  Answers recorded in §6. R3 changed from the drawing: it now reads Tracking
  health's verdict, since "Form sent" is link clicks on ronins.co.uk
  (conversion-checks-plan.md).
