# Search Console Breakdowns redone: Brand and non-brand, Click rate by position, Rich results — 20 November 2026

Drawn on the canvas "Search Console Breakdowns and Connection, three ways"
(https://claude.ai/artifact/A2zeMW73uFkUay6HMuxAUU), today's page and three ways each, on More Handles' October figures in
the United Kingdom. Anthony picked on the canvas: **Brand, Way 1** ("then for brand lets go with way 1"), **Click rate by
position, Way 3** ("lets go with way 3 on % click rate"), **Rich results, Way 3** ("lets go with way 3 for rich snippets").
Each pick was said back to him, with what it needs kept, and he said "ok im happy for you to build the chosen screen with the
new language and reading age … pleas align and build". Connection has one way drawn and wasn't picked: it waits.

## What each screen shows, top to bottom

**Brand and non-brand (Way 1).**
1. Title, and "Clicks from searches with your name, and from every other search. Your brand words are More Handles and
   MoreHandles." with Change brand words.
2. Four boxes: Clicks from brand searches and Clicks from other searches, each against the period before; Out of every 100
   clicks (brand searches, every click counted, the hidden ones too); Searches Google hides (clicks, and how many in every
   100). Today's boxes counted only the searches Google names (1,946 of 7,124 clicks in October) and said "the month before".
3. The shared `DaysChart`: clicks each day, week or month from brand searches and from the other searches Google names, in
   the page's step. Show: Clicks or Out of every 100 clicks.
4. The lean table: Keyword, Clicks, Up or down, Shown, CTR, Position. The Searches menu (Every search, Brand searches, Other
   searches) took the Brand column's place.
5. **The brand match, tighter.** A brand's words must be in the search side by side, in order (`isBrand`): "handles and
   more calgary" held both of More Handles' words and is another shop. Each list takes the rule when it's next built, as
   the nightly and weekly builds do; a finished period settled before then, and finished weeks and months older than 60
   days, keep the flags they were built with (for More Handles a few clicks: September's brand searches read 190 kept,
   189 judged again). Judging kept flags again when read was tried and dropped: the fast keyword table reads keywords as
   places in a book, with no words to judge, and the two reads must agree. Insights' own brand check
   (`insightCompeting.ts`) is left as it is while Insights is paused: a follow-up, so the same search counts the same way.

**Click rate by position (Way 3).**
1. Title, and "How often people click your website at each position in Google, {period}. Position 1 is the top of Google."
2. Three boxes: Positions 1 to 3, 4 to 10 and 11 to 20, each its clicks for every 100 impressions with two decimals, against
   the period before.
3. The shared `BarsCard`, upright: the click-through rate at each position on mobile and on desktop, side by side. Show:
   Positions 1 to 10, or 11 to 20.
4. The table, a row a position: Position, Keywords, Shown, Clicks, Mobile, Desktop. No Device menu: the columns are the
   devices.
5. **Kept each time the periods are built.** Nothing stored splits keywords by device, so the period build asks Google for
   the keyword-and-page pairs on each device a week at a time, as every pair list is (Google gives at most 50,000 rows an
   ask), each week once for every period it falls in (`deviceCurvesOf`), adds them up keyword by keyword as every keyword
   list is, and keeps only each position's figures, as period lists of their own (`mobileCurve`, `desktopCurve`). About
   120 asks a weekly build for More Handles, and the weeks of the short periods nightly, in a job of their own once the
   build is done (`keepDeviceCurves`): inside the build they ran a settle past its time in the collection test, so a
   failure there now leaves the lists before and never stops a run. Other dates and countries not
   kept ready ask Google when the page opens, one ask a device for the whole span, and the server sends back only the
   positions' figures, never the keywords; where Google gave its most, the chart says some small keywords aren't counted.

**Rich results (Way 3).**
1. Title, and "Results Google shows with extra details, like prices or stars, and the clicks they bring."
2. Three boxes: Clicks from rich results, against the period before; Out of every 100 clicks, from rich results, against it;
   Pages with a product snippet, out of the pages Google showed.
3. The shared `BarsCard`, upright and stacked: clicks each month for the last six months, split into each kind of rich
   result and Plain results (every click less the rich results'). Count: Clicks, or Out of every 100. The boxes and the
   table follow the dates menu; the chart is always the last six months, so Last month isn't one bar.
4. The lean table: Rich result, Clicks, Up or down, Shown, Position, Pages.
5. **Kept.** The period before's rich results are now kept like the pages', countries' and devices' (`KEEPS_BEFORE`), so Up
   or down has figures. Each month's are kept as the periods are built (`searchConsoleLookMonths`): a finished month is
   asked of Google once and never again, and a month inside the 60 days kept is added up from them.

## Parts

| Part | Shared already | Used as |
|---|---|---|
| `Figure`, `FigureRow`, `MoveLine`, `ChangeLine` | yes | every box, as Countries and devices' |
| `DaysChart` | yes (Performance) | Brand's chart, with `per` for Out of every 100 |
| `BarsCard` | yes (Products, Visits) | Click rate's and Rich results' charts |
| `DataTable`, `figureColumns`, `keywordColumn` | yes | every table |
| `BrandParts.tsx` | new, Search Console's | `BrandBoxes`, `BrandDaysCard` |
| `CurveParts.tsx` | new, Search Console's | Click rate's boxes and chart |
| `LookParts.tsx` | new, Search Console's | Rich results' boxes and chart |

No new kit part: every chart on the three is a part already on a redone screen.

## The eye and Ask Hakken

- **Brand**: its own rules read the boxes' figures: the share of every click, the hidden clicks, then the moves it had.
- **Click rate**: its own rules add mobile against desktop at the top three positions, and the boxes' groups against the
  period before.
- **Rich results**: its own rules for the first time (it was on the to-do list): rich results' clicks against the period
  before, their share of every click, the kind with most clicks, the kind that moved most, and the last six months' turn.
- Ask Hakken reads each screen's own figures.

## Built — 20 November 2026, on "ok im happy for you to build the chosen screen … pleas align and build"

Built on dev, not committed.

- **Screens**: `brand-and-non-brand/page.tsx` with `_components/BrandParts.tsx`; `click-rate-by-position/page.tsx` with
  `_components/CurveParts.tsx`; `rich-results/page.tsx` with `_components/LookParts.tsx`. Words in English and Italian
  (`searchConsole.brand`, `ctrCurve`, `appearance`; the Searches chip in `filters`, which Volatility shares). Two-decimal
  rates (`formatPer100`, `formatFineRate` in `searchConsoleFormat.ts`).
- **Server**: `convex/searchConsoleBreakdowns.ts` (the devices, the months, `searchConsoleLiveDeviceCurve`,
  `searchConsoleLookMonths`); the build's two new steps and `KEEPS_BEFORE` in `searchConsolePeriods.ts`; the curve read's
  `devices`; `searchConsoleWeeks.looks` and the two period lists in the schema; `isBrand` in order.
- **The eye**: Brand's rules read every click (`every`) and the hidden searches; Click rate's add mobile against desktop;
  Rich results' own (`own/searchConsoleLooks.ts`), off the to-do list (`STILL_TO_DO_MOST` 21 → 20); the three screen
  entries rewritten. **Ask Hakken**: `appearance` added, Brand with every click, Click rate with each device.
- **Looks**: the picked boards saved as `Brand`, `CtrCurve` and `Appearance` beside their look files in
  `docs/plans/assets/search-console-breakdowns/`; Volatility's look takes the chip's new name.

## Verified

- On dev for More Handles, every read on all three screens loads on every period, this week to the last 12 months, in
  about two seconds from the command line. Last month: brand 238 (242 before the tighter match), other searches 1,708,
  September 190 and 1,892; mobile 2.50% and desktop 2.15% at position 1, the whole website 2.45%; rich results 4,012
  against 4,589, six months kept June to November.
- Checked in Anthony's Chrome on Last month: all three screens draw with these figures.
- Tests: the affected suites (1,224 tests), the guards, lint on the changed files and the type check pass; Rich results'
  eye on every period on `src/test/fixtures/moreHandlesSearchConsoleAppearance.json` (read on dev, no asks of Google).
- **Pressed once each on Anthony's "Yes, press all three"** (Last month, the United Kingdom), after the last rebuild: Brand
  $0.056 in 34 seconds, Rich results $0.024 in 11, Click rate $0.025 in 10, one model call each, every figure right.
  Two weak spots, fixed on his "Yes, fix both":
  - Brand named "alexander & wilks", 10 clicks to 1, in its figures and as a step. A search it names now needs 20 clicks one
    side or the other as well as 5 moved (`moverWorthNaming`, in `own/searchConsole.ts`), and the page offers the writer
    only those as links.
  - Click rate's eye said clicks for every 1,000 times shown beside boxes for every 100 impressions. Its rules now say every
    rate as the boxes do (`ratesPer100`, the measure `clicksPerHundred` with two decimals, shown with two in the panel), and
    its screen entry tells the writer to.
  Pressed again with Refresh (a super admin's, not charged to the company): Click rate $0.024 then $0.050, now in clicks from
  impressions ("533 clicks from 28,663 impressions"); Brand $0.079 (sent back once) then $0.027, "alexander & wilks" gone,
  every figure right. About $0.29 of model time in all for the seven presses.
- **Not done**: the full gate; nothing committed. Connection, drawn as one way, waits on his word.

## Change log

- **2026-11-20** — Drawn, picked on the canvas, and "build" (above).
- **2026-11-20** — Built on dev, not committed (above). Faults found and fixed before hand-back: the devices first came
  from Google's keyword totals (7.5% at position 1 on mobile beside the website's 2.45%), then from one ask a span (cut at
  50,000 for three months and longer): now pairs a week at a time. Judging kept brand flags again on read made the fast
  keyword table read every period but two as no brand clicks: dropped, kept flags stand.
