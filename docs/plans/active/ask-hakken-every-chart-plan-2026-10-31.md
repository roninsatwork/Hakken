# Ask Hakken: every kind of chart, a wider panel, and credits for the eye — planned 2026-10-31

**Status: planned 2026-10-31, with Anthony; the drawing comes first; nothing built.** The three pieces sit in one
plan at his word ("same as the costs add that to plan please … so we can audit and double check the plan at the
end"). Goes with `sees-side-panel-plan-2026-10-31.md` (the panel and its chat) and
`sees-findings-in-code-plan-2026-10-31.md` (what a press of the eye costs).

## What Anthony asked

- Charts: "i want to do every type of chart" — after Ask Hakken told him, in the eye's panel, "Hakken does not
  generate pie charts". Today it draws one kind: a line a day against the span before (built 2026-10-07 for Search
  Console, 2026-10-31 for Google Analytics).
- The panel: "do we need to make this slightly wider as the table of data runs into each other" — a table in an
  answer in the eye's panel read "12,80834.9%", a channel's visits and share with no gap.
- Credits: "I think each press of the eye needs to consume your credit allowance" (2026-10-30), then "Don't build
  credits yet, we can make a plan for that" and, today, "add that to plan".

## 1. Every kind of chart

Ask Hakken picks the kind from the question; every figure comes from the saved data through code, never from the
model (as the line chart's do today); each chart links to the screen its figures came from; any chart can be sent
at a time, once or weekly, as built on 2026-10-31.

| Kind | For | Drawn with |
|---|---|---|
| Line | a figure each day against the span before | `SiteLineChart` (built) |
| Bars | a ranked list: visits by channel, top pages, conversions by country | `SiteBarChart` |
| Stacked bars | shares across two spans or over weeks: each channel's part of visits | `SiteBarChart` stacked |
| Pie (donut) | shares at a glance: visits by device | **new to the screen kit** — named to Anthony 2026-10-31 |
| Scatter | two figures at once: page kinds by visits against purchase rate | `SiteScatterChart` |
| Grid | rows across columns, shaded: conversions by page kind, people by hour and weekday | `ChannelMap` |

Sources, in order: Google Analytics and Search Console first (their reads exist), then Visibility, Bing Webmaster
and Microsoft Clarity as each one's saved data allows. Ask Hakken reads saved data only and never asks Google.

**Wide charts.** An answer is held to a reading width (34rem); a grid of eleven page kinds does not fit it, so
charts may break out to the full column as tables already do.

## 2. The panel a little wider, and tables that breathe

- The eye's panel is 480px on a computer (`SidePanel`, `sm:w-[480px]`). Widen it a step (about 560px) so an
  answer's table and charts fit; a phone keeps the full width.
- **Why the columns touched (found 2026-10-31):** `HakkenMarkdown` styles a table — padding, rules, smaller text —
  only for `variant="answer"` (the Insights and Discovery answers). Ask Hakken's chat uses the default `"chat"`
  variant, which leaves the table bare: the browser's own one-pixel cells. So it happens on the Ask Hakken page too,
  not only in the panel, and a wider panel alone would not fix it.
- **The fix:** chat tables take the answer's table styling; number columns line up on the right (Markdown's `---:`,
  which the model is told to use for figures) and wear JetBrains Mono, words stay Inter; a table wider than its
  column scrolls inside its own box. Drawn on the canvas, board 2: at 560px morehandles.co.uk's five-column
  channels table fits with clear gaps.
- Check with the answer Anthony saw (morehandles.co.uk's channels table) in the panel and in Ask Hakken.

## 2b. A new conversation every press of the eye

- Anthony, 2026-10-31: "i think that every time we press the eye it should open a new chat thread". Today the panel
  keeps one conversation per page for the browser tab (`hakkenSeesStore`), so a press on the same page opens the old
  questions again.
- The fix: each press opens the panel on a fresh conversation; the first question asked starts a new Ask Hakken
  conversation for the page, as today. Earlier ones stay in Ask Hakken's list, reached from "Open in Ask Hakken".
- Check: press, ask, close, press again on the same page: the box is empty and a second conversation is listed.

## 3. Credits for a press of the eye

- What a press costs now (measured 2026-10-31, after code took over the finding): about **$0.06**, 5p — the choice
  of writer and the writer, on the page's figures and code's findings. It was $0.54 the day before.
- One credit covers $0.05 of real cost (`DEFAULT_CREDIT_COVERS_USD`). **Proposed: 2 credits a press**, a new kind
  (`sees`) priced in Admin → Settings → Credit prices like every other. The 12 credits proposed on 2026-10-30 were
  for the old $0.54 press.
- A press answered from the three-hour store costs nothing: no new writing.
- Questions asked in the panel's chat are Ask Hakken messages and already charged as such (`assistant`).
- **Still Anthony's to answer:** at zero credits, does the eye stop (and say so), or keep working?

## Phases

0. **The drawing** — every kind of chart in a real Ask Hakken answer on morehandles.co.uk's figures, and the
   panel at its new width. Anthony's yes before any code. (In progress 2026-10-31.)
1. **Charts in code** — one chart shape for every kind; the reads that fill each; `show_chart` names the kind.
2. **Charts on screen** — `AnswerChart` draws each kind; the pie joins the screen kit with a look test.
3. **Charts sent at a time** — every kind in the email and the Hakken tasks page.
4. **The panel** — wider; tables padded and numbers aligned; a new conversation each press (§2b).
5. **Credits** — the `sees` kind, charged once per new bubble; zero credits as Anthony decides.
6. **The audit** — at his word, the whole plan checked against what was built, point by point, before it is
   called done: every chart kind asked for in Chrome, the panel's table, a press's credits on the Usage page.

## How we will know

- Asked in plain words for each kind, Ask Hakken draws it, from figures that match the screen it links to.
- The channels table in the panel reads with clear gaps between every column.
- Each press of the eye opens an empty conversation; the last one is in Ask Hakken's list.
- A press of the eye takes 2 credits once, and nothing again for three hours.

## Progress

- 2026-10-31: planned with Anthony. Phase 0 started.
- 2026-10-31: drawn — canvas "Ask Hakken, every kind of chart" (https://claude.ai/artifact/DMCDEfYqSVr7y63viu1wRe),
  board 1: six questions and answers in Ask Hakken, each chart drawn by the real parts from morehandles.co.uk's
  saved September figures; the pie is the one new part. Awaits Anthony's yes.
- 2026-10-31: board 2 drawn — the eye's panel at 560px with the channels table spaced and its numbers aligned; the
  cause of the touching columns found (chat tables are left unstyled) and the fix written into §2.
- 2026-10-31: phases 1–5 built and committed locally, nothing pushed (9455ce6b, 31b34270, 0ad11190, 52845d3e). Lint,
  types, guards and the whole suite (8,231 tests) pass.
- **The audit, point by point (2026-10-31):**
  - Done: bars, stacked bars, pie, scatter and grid from Google Analytics' Conversions map, by channel, kind of page,
    device or country, each from saved figures through code, each linking to its screen; a grid uses the
    conversation's full width; every kind can be sent at a time, once or weekly (the email draws each group as a bar
    with its name and figure listed, since email cannot draw a pie, a scatter or a grid; a grid's rows go as words);
    the panel at 560px; every answer's table spaced, figure columns found by code (not left to the model's `---:`)
    and set right in JetBrains Mono; a new conversation each press; the `sees` credit kind, 2 a press written, free
    from the three hours kept.
  - Not done: Search Console's groups (queries, pages) and Visibility, Bing Webmaster and Clarity — Google Analytics
    only so far; pages as a chart's groups ("top pages"); the hour-and-weekday grid; a saved-outline look test for
    the pie (component tests hold it instead); the drawing kit's parts page shows the pie's names but not its ring,
    which the chart library draws only in a browser.
  - Not checked: in Chrome — the browser tab Claude can drive was signed out, and Claude may not sign in. Anthony's
    answer still open: at zero credits the eye, like every kind today, records and carries on.
- 2026-10-31, the gaps, at Anthony's "Yes, build gaps" (583a1369): landing pages as a chart's groups; the week's
  hours as a grid (each weekday down, four-hour blocks across, the times a conversion happened); Search Console's
  searches, pages, countries and devices — clicks or impressions as bars, a pie, stacked shares, or times shown
  against the share clicked (no grid: it counts no conversions). One read for all of them
  (`assistantGroupChartReads.ts`), shared by Ask Hakken and a chart sent on its day; every one can be sent at a
  time. Checked on morehandles.co.uk's saved figures: searches (top "more handles", 84 clicks against 79), devices
  (phones 56.5% of clicks), pages' times shown against the share clicked, landing pages (the home page first,
  3,186 visits). Its hours grid says it waits for the next collection, which has not reached that list yet.
  - Still not done: Visibility, Bing Webmaster and Clarity as chart sources; a saved-outline look test for the pie.
  - Still not checked in Chrome: the drivable tab was signed out.
