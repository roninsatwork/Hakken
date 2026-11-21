# The client Dashboard, Way 1: build plan

**Status:** Plan, waiting for Anthony's go. Nothing is built.
**Date:** 21 November 2026
**Drawn on:** the canvas "Dashboard, three ways", Way 1 (https://claude.ai/artifact/Ag8PYHZMZ4DxvwfktA21CW), version 8. Boards and the script that drew them are in `docs/plans/assets/dashboard-three-ways/`.

## What it is

`/app` today is the framework's marketing page. Way 1 replaces it with the first screen a company's people see each day: a page of colourful, full-width charts from every source the company has switched on, with the Reading room near the top. No tables.

It works for every company. A shop sees Bought where a business that wants enquiries sees Events. A company with more than one website sees them added up. A section that's switched off stays off the page. A source that isn't connected says so and links to its Connection page.

## What's on it, top to bottom

| # | Part | Figures from | Part to use |
|---|---|---|---|
| 1 | Title, date line, Website menu, Dates menu | — | `PageHeader`, `DatesMenu`, the kit's filter |
| 2 | Four numbers, each with a small line of its month: Visits, Events (or Bought), Clicks, Impressions | Google Analytics and Search Console's saved days | **New shared part: `FigureSpark`** (a `Figure` with a month line under it) |
| 3 | Reading room: the lead story with its rollout line, the last three Google updates, the three newest articles | `news.getFrontPage`, `googleUpdates.listLatestGoogleUpdates`, the newest Knowledge and Helpful content | **Shared from the Reading room:** the front page's lead, last three and story columns, taken out of `NewsFrontPage` into one part both pages use |
| 4 | Search Console: Clicks from Google each week, 12 months, Google's updates marked | `searchConsolePerformance` by week | `ChartCard` + the existing line chart + `GoogleUpdateMarkers` |
| 5 | Google Analytics: Visits each day as columns split by where they came from | `analyticsChannelDays` | **New shared part: `StackedDayColumns`** |
| 6 | Google Analytics: Who visits, and who gets in touch | the Overview's own read | `HundredStrips` |
| 7 | Visibility: You and your rivals on Google, a line each over every check | `siteCharts.siteSeries` with rivals | the line chart Visibility's own pages use |
| 8 | Visibility: How often AI assistants name you and your rivals | `siteAi.shareOfVoice` | `ChannelMap` |
| 9 | Microsoft Clarity: How far people scroll down your busiest pages | `clarityPagesList` | **New shared part: `ScrollPages`** |
| 10 | Bing Webmaster: Clicks from Bing each week, or a notice if it isn't connected | `bingPerformance` | `ChartCard`, `Notice` |
| — | The eye in the top bar, and Ask Hakken | the page's own findings | `HakkenSeesEye` |

Each new part goes in `src/ui/components/screens/` with its own tests, joins the drawing kit (`scripts/drawing-kit/parts.tsx`) and the screen kit's list (`docs/developer/screen-kit.md`), and takes its colours from `chartPalette.ts`. Each is built so another screen can use it, never for this page alone.

## The one new read

No read adds up a company's websites today. One new tenant read, `dashboard.figures({ period, siteId? })`, adds up the company's own websites for the four numbers and their month lines. It reads only what the sections have already saved, never asks Google, and skips any section that's switched off, so it never throws for a company without it. The other charts use each section's existing read for the website chosen in the Website menu.

## How each state looks

- **Switched off:** the section and its charts aren't on the page.
- **Not connected:** the section's notice, with a link to its Connection page. Bing Webmaster today.
- **Collecting:** "Your figures for these dates are on their way."
- **Nothing in these dates:** the chart's own empty line, as on its own page.
- **Shop or enquiries:** Bought and sales, or Events and getting in touch, as Overview decides.
- **More than one website:** the four numbers add up every website. The charts that can't add up (rivals, AI squares, busiest pages) follow the Website menu, opening on the first website.
- **A read-only viewer:** sees everything, with no buttons that change anything.

## Limits to know

- Rivals and AI answers come from Visibility's checks, every few weeks. The chart shows only the checks there have been.
- Clarity keeps about 3 days, so a gap in Clarity stays empty.
- The 12-month chart goes back only as far as Search Console has figures (16 months at most).
- The rivals, AI squares and busiest pages show one website at a time.

## The eye

The Dashboard gets its own findings in code, like every page we've redone: the biggest change across the sources, ranked, for whatever dates are chosen. They're tested on every period the Dates menu offers, on More Handles' saved figures. Every read is checked on the dev deployment for every period before handing back, then one real press is read, with its cost said first.

## Words

All words go in `messages/en.json` and `messages/it.json`. They copy the redone screens, pass `check:words` and `check:reading`, and get a fresh reader before Anthony sees them.

## Checks before it's handed back

The focused tests while building, then the full local gate once: `verify:env`, `lint:all`, `check`, `test:coverage`, `coverage:check`, `test:e2e:smoke` and `build`. Then the page in Anthony's Chrome on `http://hakken.localhost:3000/app`, at 1,330 and 3,200 wide. It gets a look test once approved. Nothing is committed or pushed without his say-so.

## Not in this build

- Way 2's eye words laid on the page.
- Bing drawn as if connected.
- Ways 2 and 3.

## Size

About 13 developer days, or 4 to 5 agent days:

- the new read: 1.5
- the four new shared parts: 4
- the shared Reading room front page: 1
- the page, its menus and states: 2
- the eye's findings and their tests: 2.5
- words: 0.5
- tests and the gate: 1.5

## Build log

Anthony said "Yes, build it" on 21 November 2026. He also asked that every new component is a reusable shared one, that a section switched off for the company or for everyone is hidden, and that a super admin is never sent to Admin on first sign-in (already true: sign-in goes to `/app`; only the test-only e2e sign-in sends admin roles to `/admin`).

Done so far (uncommitted, on `dev`):

- `convex/dashboard.ts`, `dashboardFigures({ period, siteId? })`, with `convex/dashboard.test.ts` (6 tests). Adds up own websites through `readOverview`, `readChart` and `readPerformance`; skips switched-off sections.
- `Figure` takes a `foot`, pinned to the box's bottom so a row's feet line up; new shared `Sparkline` (`src/ui/components/screens/Sparkline.tsx`, real pixels, the app's monotone curve), tests in `Sparkline.test.tsx`. This is "FigureSpark".
- Visits by channel needs no new part: `SiteBarChart` with `stacked`, fed by `googleAnalyticsChannelPageReads.analyticsChannelsEachDay`, in the Channels page's colours.
- New shared `ScrollPages` (`src/ui/components/screens/ScrollPages.tsx`) with tests.
- `NewsFrontPage` split: `ReadingRoomFront({ dashboard, articleDays })`, shared by the Reading room and the Dashboard; `ReadingRoomFront.test.tsx`.
- `src/hooks/useSiteIdOnPage.ts`: the address's `[siteId]`, else the website the Dashboard hands down (`SiteOnPageContext`). Every section's website hook uses it (`useAnalyticsSiteId`, `useSearchConsoleSiteId`, `useClaritySiteId`, `useSiteId`, `useBingSiteId`, `useEventName`, `BingParts`), so the Dashboard can show each section's real cards unchanged.

- The page (`src/app/(dashboard)/app/page.tsx`): the four numbers with their days, the Reading room's front page, then a section per source switched on, in Anthony's order. Each source's section is its own file in `_dashboard/` (`DashboardSearchConsole`, `DashboardGoogleAnalytics`, `DashboardVisibility`, `DashboardClarity`, `DashboardBing`), drawn only inside `on(MENU_FEATURES.<section>)`. The always-on parts (`DashboardParts.tsx`: the numbers, the Reading room, the section heading) read nothing of any source's own, so the page works whichever sources a company has off. `src/section-gate-drift.test.ts` knows the five files as `SWITCHED_PARTS` and fails the page if one is drawn outside its switch.
- Fault found on the way: the numbers named their months through Google Analytics' `usePeriod`, so a company with Google Analytics off would have had the whole page fail. `useSpanName` moved to `src/hooks/useSpanName.ts` (Google Analytics' `VisitsCharts.tsx` re-exports it) and the numbers use it with `common.periods.before`.
- Charts move as they load: `Sparkline`, `ScrollPages`, `ChannelMap` and `HundredStrips` draw inside `ChartReveal`. Every chart has its menus (Show, Channels, Websites, Device); Visits each day opens on Organic Search alone (`ORGANIC_SEARCH_CHANNEL`, `convex/utils/aiAssistants.ts`). Axis labels are short days ("1 Oct", "20 Apr").
- The eye: an always-on `dashboard` section in `convex/utils/sees/screens.ts` (`SEES_SECTION_FEATURE.dashboard` is null, so `seesAsk.requireEyeSectionOn` checks no switch), screen `dashboard.home` (`screenEntries/dashboard.ts`), its own findings (`own/dashboard.ts`): each of the four numbers against the span before, plus visits for one sale (or event) and clicks for every 1,000 times shown, ranked by how far each moved. Each figure goes by its box's name (sales, events), after the fresh reader caught "purchases" and "conversions" beside Bought and Events. New measures `sales`, `visitsPerSale`, `visitsPerEvent`. The code-first brief (`CODE_FIRST_SECTIONS`). The eye accepts the Dashboard's `/app` address, and `site` joins the eye's record fields so every website's figures and one website's keep separate answers.
- Tested on every period on More Handles' saved figures (`src/test/fixtures/moreHandlesDashboard.json`, `convex/utils/sees/dashboardFindingsPeriods.test.ts`): five or six findings on five periods; three on the last 6 and 12 months, where Search Console holds no earlier figures. A press on the Dashboard with every section off is tested in `convex/seesAsk.test.ts`.
- One real press on More Handles, last month (21 November): written by the Analyst, passed by the Editor, every number right, $0.017 (3,278 tokens in).
- In passing: the eye panel no longer capitalises a figure's name mid-sentence ("Up to 191 sales", not "Sales"), on every page.
- Seen in Anthony's Chrome at 1,297 wide. Chrome would not open wider than the screen, so 3,200 wide is held only by the chart-size test (every chart drawn in real pixels at fixed heights).

Not seen in the browser: the Visibility, Microsoft Clarity and Bing Webmaster sections with real figures, as Period House Group has them switched off. Their tests pass.
