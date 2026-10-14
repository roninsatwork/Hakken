# Google Analytics — Conversions with Events merged in, and Visitors

**Planned 2026-10-14. Status: built on dev 2026-10-14, every phase, not
committed (see "Built"). Anthony: "just build the plan and stop asking
stupid questions". The flow, the bars and Visitors' browsers, systems and
interests fill from the night's run after the build.** The screens are drawn on the canvas
[GA Events, Conversions, Visitors — brainstorm](https://claude.ai/artifact/5UpYEe78pyKfp5DRm2YBYr)
(two boards; a copy, their pictures and their outlines in
[docs/plans/assets/ga-conversions-visitors/](../assets/ga-conversions-visitors/)).
Anthony, on the drawings: "i love these". Change a decision here, with a date,
before building anything that disagrees with it.

**It follows the section's data standard**,
[ga-stored-figures-plan.md](./ga-stored-figures-plan.md):
- **SF1, SF15:** a screen never asks Google. The one exception, an event's own
  funnel (SF8), is untouched.
- **SF3, SF7:** every list is kept for each device and each home country.
- **SF10:** every new store goes on the keep list.
- **SF13, SF14:** a fact that can't be added up by day is one shared list per
  date range, keyed by page, holding each page's top 20 rows and the rest as
  one "other" row.
- **SF16:** every screen and Ask Hakken read the same rows.
- **SF17–SF21:** every run stays inside Google's limits, at night.

## Why

Anthony, 2026-10-14, on Events, Conversions and Visitors: "i think they are
boring compared to the rest of the GA section". Channels and Funnel each have
one picture that joins two things together: Channels' map (where visits came
from × the kind of page they landed on) and Funnel's flow (which page led to
which). These three pages were the same parts in the same order: a line over
time, orange bars, a table. The bars repeated the table. None of them tied
what it counted to conversions.

Then, on the first drawings: "should we merge events and conversions into one
page". The answer was yes. A conversion is an event the website counts. The two
pages said the same things twice: "Form sent" isn't counted, the key events
not counted, and a list of events marked as counting or not.

## When it starts

1. **Other sessions' work in these files is committed first.** The session
   that built the stored figures and Funnel (2026-10-14) works in the same
   shared lists, collection run and list screens. Run `git status` before
   starting. Any uncommitted change there waits for its own session.
2. **Nothing is asked of Google while it is built** (Anthony, 2026-10-14:
   "don't pull until the end of the build"). Everything runs on the fake
   Google until phase 5's test together, on his go.

## 1. Decisions

- **CV1 — Events becomes part of Conversions.** One page called
  **Conversions**, and Events leaves the menu. `/events` forwards to
  `/conversions`, keeping its address whole (as `/landing-pages` forwards to
  `/funnel`). An event's own page stays: the table's rows open it, and its
  back link returns to Conversions. These links that pointed at Events now
  point at Conversions:
  - Visitors' What Hakken sees step "checkBrowser" (`convex/utils/sees/analyticsVisitors.ts`).
  - Ask Hakken's events answer (`convex/assistantAnalyticsReads.ts`).
- **CV2 — Conversions, top to bottom:**
  1. The site header and section menu, as now, then the freshness line.
  2. The page header (no divider). Its description: "Each thing this website
     counts as a conversion, the route the visits took to reach it and what it
     was worth; what people did before converting; and every other event
     Google Analytics recorded."
  3. What Hakken sees, with up to three Do first steps.
  4. Four figures: **Conversions, Value, Conversion rate, Key events not
     counted**. The last replaces "Kinds that happened", using Channels' own
     words: "'Form sent' happened, but isn't counted as a conversion".
     A shop keeps revenue, purchases and average order first (GA7, as
     locked).
  5. **Conversions over time**, as approved on 9 October (GA35). Anthony:
     "keep the Conversions over time chart; the length is fine".
  6. **How visits reached a conversion, by page classification** (CV3).
  7. **What people did before converting** (CV4).
  8. The search box and Kind filter, then **one table of every event** (CV5).

  These go:
  - From Events: "Scrolls and link clicks a day" and "Times each event
    happened".
  - From Conversions: "Conversions by landing page", "What counts" and "Where
    they came from". The flow and the table now carry what those showed.
- **CV3 — The flow (PageFlowChart, extended, not forked).** Three columns:
  - **Came from**: the 4 biggest channels, then "(n more channels)".
  - **Landed on**: the 5 biggest page classifications, then "(n more
    classifications)". Pages with no classification share one
    **"Unclassified"** box (Anthony, 2026-10-14). "No page recorded" keeps its
    own box.
  - **Ended in**, in this order:
    1. Every key event of the property: the ones counted first, then any key
       event not counted. A not-counted box has a grey edge and the words
       "not counted".
    2. Counted kinds that never happened, faded, with the words "0 · never
       happened".
    3. **Left without converting**, with a red edge.

  On a shop, Purchase is one of the counted kinds, and a route's hover adds
  its revenue (Anthony: "yes").

  Box heights, hovers, the conversion dots on routes and click-to-follow all
  work as LF2, and the chart opens with no route followed. **The extension to
  PageFlowChart** is the outcome column's kinds: an edge colour, faded boxes,
  and a third line in the key. A conversion is dotted where it happened (on
  its routes and its own box), not again on every box upstream.
- **CV4 — What people did before converting.** It reuses the look of
  Channels' "What a visit is worth, by channel":
  - One bar for each event that isn't a conversion, leaving out Page viewed
    and Visit started, because every visit has them.
  - The bar is the share of the people who did it that went on to convert,
    the same measure as an event's own page ("people who converted after it").
  - **The last 12 months, whatever the dates chosen**, so the smaller actions
    have enough people to judge. **Every device, main home country**; the
    hint says so, as Channels' map does.
  - Orange where it beats the website's rate on 100 people or more, grey
    otherwise.
  - Hovering a bar gives the people, the conversions, the rate and the
    website's rate.
- **CV5 — The table: every event.** Columns:
  - **Event**: its own name, then Google's name in grey.
  - **Times**, **People**.
  - **Conversion**: a StatusLabel. "Counts" with a tick, "Not counted" with a
    warning sign for a key event not counted, "–" for the rest.
  - **Change**: times against the span before.

  It opens sorted by Conversion: the counted events, then key events not
  counted, then the rest by times. Every heading sorts the whole list. Search
  and the Kind filter work as now. It starts at 25 rows, with the
  25 / 50 / 75 / 100 choice.

  **No "Then converted" column** (Anthony, 2026-10-14: "yes"). It would need
  Google's funnel for every event, date range and device, about 190 asks a
  night. The bars carry it instead.
- **CV6 — What Hakken sees on Conversions.** Its words come from fixed rules
  over stored rows (`convex/utils/sees/`), with no AI spend. It merges the two
  pages' readings:
  - Where the conversions came from (channel and classification).
  - A channel bringing most visits and none converting.
  - The action whose people convert most above the website's rate, over 12
    months.
  - Key events not counted.
  - Counted kinds that never happened.

  Do first, up to three steps:
  1. Open the channel that converts nothing.
  2. Decide whether a key event not counted should count (the Connection
     page).
  3. Try the counted kinds that never happened yourself (Tracking health).
- **CV7 — Visitors.**
  - **"Where each kind of visitor lands, by page classification"** uses the
    kit's ChannelMap. Its rows follow the switch above the table: the **8
    biggest groups**, then "Everything else". Its columns are the website's
    page classifications, then Unclassified and No page recorded. Each square
    is the group's visits that started on that kind of page, shaded by its
    share of the row, with its conversions under the number. It replaces the
    "Visits by …" bars, which repeated the table.
  - The switch opens on **New or returning** (it opened on Browsers).
  - The table gains **"Lands most on"**: the classification most of a group's
    visits started on, and its share ("Service · 35.2%"), as Channels' table
    shows.
  - **The two "Unknown" rows become one.** The live screen shows two, and
    phase 0 finds out why.
  - "New and returning visitors a day" gets a dot on each day with a
    conversion, larger for more.
- **CV8 — What is new to collect, and nothing else.**
  - **The flow** is worked out when it is read from `landingChannel` (landing
    page × channel, with each key event), plus the website's page
    classifications. That is the list Channels' map already reads, so the two
    can't disagree (SF16). Nothing new is asked. (Changed after phase 0: the
    plan first named `landingSource`.)
  - **"Left without converting" is exact.** Beside `landingChannel`'s asks
    for the dates now, one more small ask: each row's visits that made any
    listed event, each counted once (`sessions`, filtered to the events, not
    split by event), kept as the row's `converting`. The box is visits less
    those. About 8 asks a night for each home country. (Anthony, 2026-10-14:
    first Q2's option one, Google's share of visits with a key event; then,
    told that Google's key-event figures start only on the day an event is
    marked, the reason Hakken counts conversions with BT1, "use the extra
    ask".)
  - **The grid**:
    - New or returning comes from `landingSource`.
    - Age and Gender come from `landingWho`.
    - Browsers, Operating systems and Interests are **three new shared
      lists**: landing page × browser, × operating system and × interest.
      Each is kept for every date range, device and home country, holds a
      page's top 20 rows plus "other", and goes on the keep list.
    - Interests count against Google's allowance of 120 age, gender and
      interest asks an hour. Anthony, 2026-10-14: "thats ok we need to store
      it".
  - **The bars** are Google's funnel from each action to the conversions,
    over 12 months, every device. They are asked by the nightly run with the
    rest, not by the screen, and kept a day. About 8 asks, none of them age,
    gender or interest.
- **CV9 — Collect only, no fill** (Anthony, 2026-10-14: "collect only"). The
  shared lists are kept per date range, so the first night's run after the
  build fills every range at once. Until then, the parts that read them say
  "Still being collected…".
- **CV10 — What a night costs.** For ronins.co.uk, one home country:
  - The three new lists are 4 date ranges × 4 devices each. Browser and
    system are asked twice (figures and key events), interests once: 80
    asks.
  - Converting adds about 8, and the funnel bars up to 10.
  - 16 of those asks (Interests) are age, gender or interest asks. That takes
    the night's total of such asks from about 168 to about 184. That is still
    two hours of the run's budget of 96 an hour, so the night keeps its one
    hour-long wait and gains no second one.
  - Every other home country adds its own lists and converting asks.
  - (Counted when built, 2026-10-14; first written as 48.)

  The fake Google counts these asks in the tests (SF17).
- **CV11 — Limits, all said** (as built, each a named constant):
  - The flow: 4 channels and 5 classifications, then "more".
  - The grid: 8 groups, then "Everything else".
  - The shared lists: 20 rows a page plus "other".
  - The bars: rates from under 100 people are greyed.
  - The table: 25 rows to start.
- **CV12 — The look is locked.** The approved boards, their pictures and
  their outlines are saved in `docs/plans/assets/ga-conversions-visitors/`.
  The outlines wait in `outline/` (`Conversions.txt`, `Visitors.txt`) and move
  to `look/` in phases 3 and 4, alongside each screen's look test
  (screen-kit.md, "Approved Looks And Their Look Tests"). `look/` holds only
  looks that have a test (`src/look-tests-drift.test.ts`). Changing either
  look means drawing it again and getting approval.

## 2. What the drawings showed

The two boards use ronins.co.uk's real figures for the last 30 days where
Hakken holds them. Where it doesn't hold them yet, the figures are made up
in proportion to the real ones:
- the 12-month funnel bars;
- the routes from page classification to how a visit ended;
- the visitor groups by page classification.

The drawn table still had a "Then converted" column until Anthony agreed to
drop it (CV5); the saved board is without it.

## 3. What Hakken already holds, and what is new

| Part | Read from | New? |
|---|---|---|
| Conversions' figures and Conversions over time | Day facts (SF12) | No |
| The flow | `landingChannel` (as Channels' map) + page classifications, worked out when read | No |
| What people did before converting | Google's funnel, each action → conversions, 12 months | **Yes**: about 8 asks a night |
| Every event table | Each event a day (SF12), event kinds | No |
| Visitors' grid: New or returning | `landingSource` | No |
| Visitors' grid: Age, Gender | `landingWho` | No |
| Visitors' grid: Browsers, Operating systems, Interests | Landing page × browser / × OS / × interest | **Yes**: three shared lists |
| Visitors' "Lands most on" | The same rows as the grid | No |

## 3b. Phase 0 — what ronins.co.uk showed (2026-10-14)

Read from what Hakken holds, through Ask Hakken's own internal read
(`assistantAnalyticsReads:googleAnalyticsInternal`) and the stored parts. No
code was written and nothing was asked of Google.

- **The flow's source is sound.** Channels' map, worked out from
  `landingChannel`, matches the stored channel list:
  - Over 30 days: 248 visits against 249, and 3 conversions against 3.
  - Over 12 months: 4,462 visits against 4,458, and 68 conversions against
    68.

  The difference of one to four visits is Google's own rounding between the
  two asks. The Conversions figures show the website's total (247 visits), so
  the flow's column headings say the flow's own count.
- **Every key event is in each row.** `landingChannel` and `landingSource`
  both carry purchase, form_submission, live_chat_event, phone_number_click,
  email_link_click and contact, so "Ended in" can name each one:
  - Over 30 days: Contact 3 and Form sent 7.
  - Over 12 months: Contact 68 and Form sent 168.
- **"Left without converting" cannot be counted exactly from what is kept.**
  The rows hold each key event's count, not how many visits made one.
  "Visits less key events" is only right when no visit makes two. On ronins
  it never goes wrong: in 30 days, 7 of 64 rows had a key event, and none had
  more key events than visits. Q2 asks how to count it.
- **The two "Unknown" rows** are Google's "(not set)" (17 people, 21 visits)
  and a blank (1 person, 1 visit). The screen names both "Unknown"
  (`isUnknownValue`). They are added into one row when read. The same pair
  appears in `landingSource`'s new or returning, so the grid adds them up the
  same way.
- **Nothing was folded into "other"** on ronins: no page had more than 20
  rows. A larger client is measured before deciding anything on it
  (decide-on-real-scale-sites).
- **Classified pages.** ronins' landing pages are nearly all classified: 1
  visit in 30 days, and 29 of 4,462 in 12 months, landed outside the named
  classifications.
- **Age and gender by landing page** (`landingWho`, 30 days) is held but
  marked as held back by Google, so the grid's Age and Gender views carry the
  privacy line, as the table does.

## 4. Phases and size

Man-days, as a developer would take them. Each phase stops for Anthony's go.

| Phase | What it does | Man-days |
|---|---|---|
| 0 | **Check, from stored rows only (nothing asked of Google).** On ronins.co.uk, check that the flow worked out from `landingSource` matches Conversions' own totals. Settle how "Left without converting" is counted (visits less the visits that made a key event). Find why Visitors shows two "Unknown" rows. Report before phase 1. | 0.5 |
| 1 | **Collect.** `landingChannel`'s share of visits that made a key event (CV8), the three new shared lists and the nightly funnel asks, inside the run's budget (SF17), on the keep list (SF10). Tests on the fake Google count each night's asks (CV10). | 2 |
| 2 | **Reads.** The flow, the bars, the grid and "Lands most on", worked out from the stored rows. Ask Hakken reads the same rows (SF16). What Hakken sees' rules for both pages (CV6). | 2 |
| 3 | **Conversions.** The merged page (CV2), with PageFlowChart's outcome column (CV3). `/events` forwards to `/conversions`, and the links in CV1 move. The old parts go. English and Italian words. The look test. | 2.5 |
| 4 | **Visitors.** The grid, the switch opening on New or returning, "Lands most on", one Unknown row, conversion dots. The look test. | 1.5 |
| 5 | **Proof.** The full gate, GitHub's steps included. Then, on Anthony's go, ronins.co.uk's first night on real Google, with the asks counted first. | 1 |

**Total: about 9.5 man-days.**

## 5. Risks

- **Google's funnel report is in alpha** (the Data API's v1alpha). If Google
  refuses it, the bars say so and keep the last answer held. An event's own
  page already copes with this.
- **Interests are often held back by Google.** Google signals are off on
  ronins.co.uk. The Interests view of the grid says so, as the table does
  now.
- **The shared lists keep 20 rows a page.** A landing page's "other" row has
  no channel or group. The flow and the grid fold it into their "more" box.
  Phase 0 measures how much of ronins.co.uk's visits that is.
- **A website with few classified pages** shows most visits as Unclassified.
  That is the truth, and the box says so.

## 6. Questions for Anthony

1. **Answered 2026-10-15: "I prefer unclassified", then "Go".** Every
   "Not sorted" on screen now reads "Unclassified":
   - 25 English words, where Italian already said "Non classificata";
   - the downloads' words (`siteExports.ts`, `searchConsoleLists.ts`);
   - Ask Hakken's words.

   A classification may be named neither "Unclassified" nor "Not sorted".
   "Unclassified" or "Not sorted"? These two pictures say "Unclassified",
   as you asked. The rest of the app says "Not sorted": the Funnel's Page
   group filter, and a channel's page. Should those change to "Unclassified"
   too? This doesn't block the build.
2. **Answered 2026-10-14: option one.** How to count "Left without
   converting" (from phase 0). Option one:
   add one more figure to the landing-by-channel ask the run already makes,
   Google's share of each row's visits that made a key event
   (`sessionKeyEventRate`). It adds no ask, and the box is exact. Option two:
   count visits less key events, which is wrong only when a visit makes two
   key events (never on ronins in 30 days). I'd take option one.

## Built

**Phase 1 — 2026-10-14** (Anthony: "start phase 1"). On dev, not committed.
Built and tested on the fake Google; nothing was asked of real Google by
hand. The `convex dev` server running in the checkout has pushed it to the
dev deployment, so the night's run from then on collects these:

- **Visits that made any listed event** (CV8): `askList`'s `converting`, one
  ask beside each `landingChannel` ask for the dates now, by device and
  whole, kept as the packed column `converting` (`analyticsPackedRows`,
  `ListRow.converting`). The span before and a year before are not asked: no
  flow compares them.
- **The three new shared lists**: `landingBrowser`, `landingSystem`,
  `landingInterest` (`PAGE_FACT_LISTS`), in the shared page lists' step after
  `landingWho`. Each is kept for every date range, device and home country,
  with a page's top 20 rows plus "other". Browser and system carry each key
  event.
- **Each action's funnel** (CV4): `googleAnalyticsActionFunnels.ts`, a step at
  the end of the night's lists. It asks the 10 busiest actions by people over
  12 months (`FUNNEL_ACTIONS`). An action is any event that isn't a
  conversion, less Page viewed and Visit started. Each is one budgeted ask of
  Google's funnel report, every device, main home country. Each answer is
  kept where an event's own screen reads its 12 months for every device
  (`funnelAsk(event, "365", "")`), so the two show one figure. A refusal of
  the funnel report itself is kept as refused, as the screen keeps it; a
  spent budget, Google busy or access lost stops the step like any list.
- **Tests** (`convex/googleAnalyticsCollect.test.ts`):
  - What a night keeps: `converting` per channel, the three lists, scrolling's
    funnel.
  - What it asks: 8 asks for converting, 32 for browser, 32 for system, 16 for
    interests, one funnel an action.
  - Which actions are chosen.
  - The fake Google answers "visits with any of these events"
    (`src/test/googleAnalyticsFake.ts`).
  - The night's run still takes two hours, never refused.

Decided while building, in the plan's spirit:

- **Interests by landing page are asked without the key events.** With them,
  the night's age, gender and interest asks would go past two hours' budget
  (96 an hour) into a third hour. So the Interests view of the grid shows
  visits without a conversion count. Say so if conversions there are worth
  the extra hour a night.
- **What a night costs, as counted on the fake Google, for one home
  country:**
  - 8 asks for converting.
  - 80 asks for the three lists, 16 of them interests.
  - Up to 10 funnels.
- **The run's own budget covers the funnels**; an event's screen asking
  live still doesn't (SF17).

**Phases 2 to 5 — 2026-10-14** (Anthony: "just build the plan"). On dev,
not committed.

- **Reads** (`convex/googleAnalyticsConversionReads.ts`):
  - the flow (`readConversionFlow`), worked out from `landingChannel` and
    the page classifications, with "Left without converting" from the kept
    `converting`;
  - conversions by page classification (the flow's `grid`);
  - what people did before converting (`readBeforeConverting`), from the
    night's funnels beside everyone's own;
  - Visitors' grid (`analyticsVisitorMap`), which also gives the table's
    "Lands most on".

  Conversions' answer carries the flow and the bars, so the screen, What
  Hakken sees and Ask Hakken read one set of rows (SF16).
- **What Hakken sees**: Conversions says where the conversions came from,
  the biggest channel converting nothing, the action above everyone's rate
  and the key events not counted. Its steps open that channel, decide on a
  key event not counted, then try the kinds that never happen. Visitors says
  where returning visitors land. The words are in English and Italian;
  `scripts/seen-words.mjs` was run.
- **Ask Hakken**: Conversions answers by channel, by page classification,
  each event by classification, and what people did before converting.
  Events links to Conversions. Visitors opens on new or returning, with
  where each group lands.
- **Conversions** (`conversions/page.tsx`), as CV2:
  - the flow uses `PageFlowChart`, extended with an `ending` per box and the
    key's third line;
  - conversions by page classification uses `ChannelMap`, whose key can now
    leave out the conversions line;
  - the bars use the look of "What a visit is worth";
  - the events table sits in the page's own file, as the screen kit's guard
    wants a table beside its page header.
- **Events**: off the menu. `/events` forwards to `/conversions` with its
  address whole. An event's own screen goes back to Conversions, and the
  menu lights Conversions while it is open.
- **Visitors** (`visitors/page.tsx`), as CV7:
  - the grid, and the switch opening on new or returning;
  - "Lands most on" in the table;
  - one Unknown row (`visitorGroupOf`), in the table and the grid;
  - a dot on each day with a conversion.
- **Looks**:
  - `look/Conversions.txt` and `look/Visitors.txt` are held by their look
    tests.
  - The first round's Events, Enquiries and Visitors outlines are retired.
  - An event's screen's back now reads "Conversions".
- **Tests**: `convex/googleAnalyticsConversionReads.test.ts` covers the
  flow, the grid, the bars, the visitor grid, one Unknown and another
  company's website. Also the sentence tests, and the drift tests that
  name the screens and the reads that keep the live and funnel rows.
- **Seen in Chrome on ronins.co.uk** (dev):
  - Conversions: What Hakken sees reads "All 3 came from Direct visits that
    landed on Brand pages", the four figures, the grid, and the table
    conversions first. The flow and the bars wait for tonight's run.
  - Visitors: the grid for new, returning and Unknown, the conversion dots,
    one Unknown row, and "Lands most on".

Decided while building, in the plan's spirit:

- **Conversions by page classification** (Anthony, on the drawing: "i
  think we need to add conversion by page classification to the page too",
  then "maybe in this style", pointing at Visitors' grid): a grid after the
  flow, drawn on the canvas and saved with the look. The conversions and
  key events not counted are down the side, the classifications across,
  each square that event's count.
- **No classifications at all**: every page is Unclassified, as Anthony
  answered, rather than Hakken's own page types. Channels' map still falls
  back to the page types; the two differ only for such a website.
- **The fourth figure** shows the kinds that happened, as before, when no
  key event goes uncounted.
- **Nothing counted yet** keeps its box and gains every event under it, so
  no website loses its events with the Events page gone. Its saved look
  gains the table.
- **The bars' rate is people, against everyone's people.** The night also
  asks the funnel from "visit started" (`WEBSITE_FUNNEL`), so the website's
  rate is counted the same way as each bar: one funnel more a night.
- **`googleAnalyticsCollect.ts` stays under the 1,000-line ceiling**: the
  page numbering moved to `googleAnalyticsPageNumbers.ts`.

Not checked here: the local browser smoke tests. They start their own
server on port 3000, where the dev server already runs (AGENTS.md).

## Change log

- 2026-10-15 — Q1: Anthony prefers "Unclassified" to "Not sorted"; on his
  "Go", every screen, download and Ask Hakken answer now says Unclassified.

- 2026-10-14 — Phases 2 to 5 built (see "Built"): Conversions with Events
  merged in and conversions by page classification; Visitors' grid.
- 2026-10-14 — Phase 1 built (see "Built"). "Left without converting"
  counted with one extra ask, not Google's key-event share (Anthony: "use the
  extra ask"). Interests by landing page without key events, to keep the
  night at two hours.
- 2026-10-14 — Q2 answered, option one: `landingChannel` keeps Google's
  share of visits that made a key event, so "Left without converting" is
  exact (CV8, phase 1).
- 2026-10-14 — Phase 0 done, from stored rows only (§3b). The flow reads
  `landingChannel`, as Channels' map does. The two Unknowns are "(not set)"
  and a blank. Q2 added: how to count "Left without converting".
- 2026-10-14 — Planned after "i love these" and Anthony's answers:
  - Pages with no classification show as Unclassified.
  - The limits: 4 channels and 5 classifications in the flow, 8 groups in
    the grid.
  - A shop's flow ends in Purchase, with revenue on hover.
  - Collect only, no fill.
  - "Then converted" only in the bars, asked nightly.
  - Interests stored even though they count against the age and gender
    allowance.
- 2026-10-14 — Drawn: Events merged into Conversions; Conversions over time
  kept; the flow by page classification.
