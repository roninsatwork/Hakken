---
product: Hakken
documentation_type: Plan
feature_area: What Hakken sees in the header; the Dates menu's rolling periods and custom dates
audience: Anthony, future agents
source_repository: roninsatwork/Hakken
source_path: docs/plans/active/sees-header-and-rolling-dates-plan.md
last_reviewed: '2026-10-29'
status: Building
---
# What Hakken sees in the header, and the Dates menu's rolling periods

Agreed with Anthony on 2026-10-29 from the canvas
[Dates menu and What Hakken sees](https://claude.ai/artifact/KsGBfwcAL5ZBHYSPDRpg14): board 1 (the Dates menu with
today's days) and option 7 (the eye beside the title) — "Build this". The approved boards are saved beside this plan
under `docs/plans/assets/sees-header-and-rolling-dates/`.

## Part one — What Hakken sees lives in the header

**What was wrong.** The box opened by itself on every one of the 158 screens that draw it, until folded there, and
opened again whenever its advice changed. Anthony, 2026-10-29: "what hakken sees take up a lot screen real estate when
all i want to see is the graphs and data".

**What it is now (option 7, "the eye").**

- **The eye**: a bordered 38px button with the eye icon in the brand colour, right after the page title, on every
  kind of header — a top-level page (`PageHeader`), a tabbed section (`DetailLayout`), a record page (`DetailHeader`,
  stacked, path and compact). It is drawn by the header itself, from what the screen's box publishes, so no screen
  adds it by hand; a screen whose box has nothing to say has no eye.
- **Beside it, how many new steps**: "2 new" — the box's Do-first steps, until the box has been opened on this
  advice; then nothing. "New" is judged as the fold was (search-console-volatility-plan.md §8, HS3): the advice's
  codes, so the same advice on today's numbers is not new again.
- **Hover**: a tooltip — "What Hakken sees · 2 things to do first" — a new kit part, `Tooltip`, drawn by the app
  (today's icon buttons use the browser's own, which looks different in every browser).
- **Click**: the eye stays pressed and the box opens where it has always sat, under the header at the top of the
  page; the box's own chevron, or the eye again, closes it. **Closed by default on every screen**, and it stays closed
  until opened; opening it marks the advice read in this browser (`hakken.sees.read.<screen>`), as the fold was
  remembered.
- **Not a pop-up** (AGENTS.md: a pop-up is only for a yes or a no; Sites never uses them).
- The eye is in the brand colour, which in the saved look is ivory, so it reads white; what makes it stand out is
  the bordered button, not colour (Anthony is red/green colour blind).

**Where it lands.** `HakkenSees` publishes its box to a store keyed by the screen's address and draws the card only
while open; `HakkenSeesEye` reads the store and is drawn by the three header parts. Where a page's own `PageHeader`
sits under its section's header (Google Analytics' "Overview" under the website's header), the outermost header
draws the eye: the first header to mount on a screen claims it. The seven wrappers (`SiteSees`, `SearchConsoleSees`,
`AnalyticsSees`, `BingParts`, `ResearchSees`, Clarity's and Insights' own `HakkenSees` calls) do not change.

**Look tests.** The box is closed by default, so every approved outline loses its "What Hakken sees" card and gains
the eye; the drawing's approval covers them, and they are re-saved in the same commit.

## Part two — the Dates menu: rolling periods and custom dates

**What was wrong.** The 20 October list said "This quarter, Last quarter" and the build read them as calendar
quarters (July to September). Anthony, 2026-10-29: "what was built was the financial quarter. Which is what I never
asked for … I genuinely want to see the last 3 months … the last 6 months of data in a graph … the last year".

**The menu, everywhere** (board 1, "I love the dates they work really well"):

**This week · Last week · This month · Last month · Last 3 months · Last 6 months · Last 12 months · Custom dates**

The quarters and This year go. Every date menu reads the one list (`convex/utils/calendarPeriods.ts`, held by
`src/calendar-periods-drift.test.ts`), so every section changes together. The menu shows each choice's days beside
it, as drawn — the menu becomes a kit part, `DatesMenu`, in place of the plain `Select`.

**The rules** (calendar-periods-plan.md rules 1–4, 6, 8, 9 and 11 stand; 5 and 10 change):

1. Weeks and months as before. **The rolling periods run to the newest day the source holds** (yesterday for
   Google Analytics, Google's newest day for Search Console, and so on), back the same number of whole months: on
   29 October with 28 October held, Last 3 months is 29 July to 28 October, Last 6 months 29 April to 28 October,
   Last 12 months 29 October 2025 to 28 October 2026. *Assumed, not yet confirmed*: Anthony said "I love the
   dates" of the board that shows exactly these; the alternative, whole months ending with last month, is a
   one-line change in `periodBounds`.
2. **Compared with** the same span before (the 3 months before, and so on). **A year before** only on Last 12 months
   (rule 5 narrows: the quarters have gone).
3. **The chart's step**: days for weeks and months, weeks for 3 and 6 months, months for 12.
4. **Custom dates**: a first and a last day, kept in the address as `?from=&to=`, within what the source holds. The
   step follows the span's length by the same rule. Compared with the same number of days before.
5. **Whole-year figures** (old rule 10) read Last 12 months.

**What each section needs** (the shape of calendar-periods-plan.md, "What each section needs", with the periods
swapped):

- **Sites**: front end only; the backend takes `from`/`to`/`step`; custom is free.
- **Clarity, Bing totals, Search Console totals and charts, Settings, Governance**: by day; any range, custom
  included, from the days held.
- **Search Console lists**: prepared per period; Last 3, 6 and 12 months join (asked of Google in 7-day pieces and
  kept, rebuilt weekly as This Quarter and This Year were); a custom range asks Google live. The keep rule, Your
  pages, Bing's Google column and Insights' reads move from the quarters to Last 3 months.
- **Google Analytics** — the cost: every list is Google's own answer per period. Last 3, 6 and 12 months are asked
  nightly as This Quarter and This Year were (about the same load); the quarter and year answers stop. **Custom
  dates** (*assumed, not yet confirmed*): the figures and charts come from the days, weeks and months held, at
  once and for free; the people-based figures (visitors, new or returning) and the per-period lists (pages,
  channels, events) are asked of Google live when the range is picked, within the website's allowance with a
  fifth kept in hand, never retried on a refusal, and kept for the day. The screens say which figures are from
  the days held and which Google was asked for.
- **What read the quarters** moves: Insights' reads (Last 3 months for the old quarter), the keep rule, Your pages,
  Bing's Google column, the health checks, Ask Hakken's period names, the Monday report.

## Phases

| # | Phase | Days |
|---|---|---|
| 1 | The `Tooltip` part, the sees store, `HakkenSeesEye` in the three header parts, the box closed by default; tests, look files, kit and docs | 1 |
| 2 | The period list and rules: the three rolling periods, custom dates, the step rule, `DatesMenu`; drift test | 1–1½ |
| 3 | Sites, Clarity, Bing, Search Console on the new list; what read the quarters | 3–4 |
| 4 | Google Analytics: collection, comparisons, screens, custom dates | 5–6 |
| 5 | The full check and GitHub's own steps; commit | 1 |

Built section by section on `dev`, each committed, nothing pushed (no-push-until-told). Google is asked for nothing
until the build ends (no-pulls-until-build-ends); the first collection of the new periods runs on Anthony's go.

## As built (2026-10-29)

- **Phase 1 committed** (67f0276f): the eye, the tooltip, the store, the box closed by default, 91 outlines re-saved.
- **The period list**: `CALENDAR_PERIODS` is the menu's seven; the quarters and This year are `RETIRED_PERIODS`, still
  in the type and the validators so the rows prepared for them do not break the schema, and no menu offers them. A
  rolling period is "running" (asked every run, like This month) and always whole; its span before is the same number
  of months before; only the 12 months have a year before, and it is their span before. `monthsOf` is 0 for any other
  period.
- **The Dates menu** is the kit part `DatesMenu` (the chip names the choice; the list shows each period's days to the
  section's newest day; Custom dates are a first and a last day, within what the section holds, shown on Show). Every
  section draws it through `SiteDateRange` (Sites, Search Console), its layout (Bing, Clarity), the Settings overview
  and Governance. A section passes `custom={false}` until its reads answer custom dates.
- **What read the quarters now reads the rolling periods**: Search Console's "lately" (`RECENT_PERIODS`, the keep rule,
  Your pages, competing pages) is Last 3 months; the long-period settle stage and Bing's Google column follow; the
  tracking-health page check reads Last 3 months; a shop is noted from Last 3 months and un-noted once they show no
  step; the action funnels' fallback and Insights' yearly reads are Last 12 months; Ask Hakken's period names are the
  menu's.
- **Custom dates, as built**: offered where a section reads by first and last day. Sites' dated screens (the address
  carries `period=custom&from=&to=`; the six screens that read a period itself — reviews, mentions, local activity,
  rivals' moves — do not offer them and read the opening period if the address carries them), every Search Console
  screen (totals and charts from the days held; the lists asked of Google live with no period, as other dates always
  were; the box is not drawn for custom dates, since it speaks in the menu's periods; Demand by service reads the
  opening period), the Settings overview and the evidence pack. Not yet: Google Analytics, Bing, Clarity and the
  Governance activity chart, whose reads are prepared per period (`custom={false}`).
- **The retired periods are gone** (2026-10-29, Anthony: "delete them"): a one-off clean-up deleted the 929 parts
  prepared for them across 55 websites' Search Console, Bing and Clarity tables, and Google Analytics' nightly
  clean-up of lists no run keeps (`dropCountriesNotKept`, which now judges those periods retired) cleared its 0 of
  3,814 slots; then the names left the type, the validator and the words. The clean-up code was removed with them.
- **Still to do**: the first collection of the new periods, on his go (no-pulls-until-build-ends).

## Change log

- 2026-10-29: plan written from the canvas and Anthony's "Build this"; phase 1 built and committed; phase 2 built, phase 3 under way.
