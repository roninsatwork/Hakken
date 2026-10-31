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
- An answer's tables already pad their cells (`HakkenMarkdown`, `px-3`), yet the panel showed none: find why the
  padding is lost in the panel, and right-align number columns so figures never touch.
- Check with the answer Anthony saw (morehandles.co.uk's channels table) in the panel and in Ask Hakken.

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
4. **The panel** — wider; tables padded and numbers aligned.
5. **Credits** — the `sees` kind, charged once per new bubble; zero credits as Anthony decides.
6. **The audit** — at his word, the whole plan checked against what was built, point by point, before it is
   called done: every chart kind asked for in Chrome, the panel's table, a press's credits on the Usage page.

## How we will know

- Asked in plain words for each kind, Ask Hakken draws it, from figures that match the screen it links to.
- The channels table in the panel reads with clear gaps between every column.
- A press of the eye takes 2 credits once, and nothing again for three hours.

## Progress

- 2026-10-31: planned with Anthony. Phase 0 started.
