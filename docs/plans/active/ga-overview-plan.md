# Google Analytics — Overview: every figure

**Planned and built 2026-10-15. Anthony: "Build 4 please".** The screen is
board 4, "Every figure", on the canvas
[GA Overview — three alternatives](https://claude.ai/artifact/LsqcX3mtTBrHBVdf9zPuva);
a copy, its picture and its outline are in
[docs/plans/assets/ga-overview/](../assets/ga-overview/). Change a decision
here, with a date, before building anything that disagrees with it.

**It follows the section's data standard**,
[ga-stored-figures-plan.md](./ga-stored-figures-plan.md): the screen never
asks Google (SF1); it reads only the lists the night's run keeps for each
device and home country (SF3, SF7); and Ask Hakken reads the same rows (SF16).

## Why

Anthony, 2026-10-15: "next page to look at is the overview page, taking the
best of the other pages to this page". Four ways were drawn. Then: "But the
pages you drew don't cover all the [key data points]". Option 4 was drawn to
cover every kind of data Hakken keeps from Google Analytics, each kind in its
own panel and each panel linking to its own page. He chose it.

## The page, top to bottom (OV1)

1. **What Hakken sees**, as built (`overviewSees`).
2. **The figures**, as built (`AnalyticsFigures`). The drawing showed four;
   the app's row already shows more of the data (page views, people, visit
   length, pages a visit, bounce rate), which is what this page is for.
3. **Page views and visits a day**, as built (`VisitsChart`).
4. **Where visits came from** (OV2).
5. **Pages by classification** (OV3).
6. **Where visits landed** (OV4).
7. **Conversions** (OV5).
8. **Who visited** (OV6).
9. **Shop**, only for a website that sells (OV7).
10. **Tracking health** (OV8).

Each of 4–10 is the kit's `AnalyticsPanel` holding a `CompactList`, with its
"See all" link to its own page underneath. The page loses "Where visits came
from" as bars and "What changed most": the panels hold both.

## The panels

- **OV2 Where visits came from.** The 3 channels with the most visits: visits,
  change, conversions, value. The line above says the channels' count and
  the visits from tagged links and ad keywords (Campaigns' lists). Links to
  Channels.
- **OV3 Pages by classification.** The 3 classifications whose landing pages
  had the most visits: visits, change, the share who left from them (Funnel's
  "went on", turned round), conversions. A website with no classifications
  says so. Links to Funnel.
- **OV4 Where visits landed.** The 3 landing pages with the most visits, each
  with its classification: visits, change, the share who left, conversions.
  Visits with no page recorded are left out of the three. The line above
  gives page views, pages and time a visit, and the share of all visits that
  left from the page they landed on. Links to Funnel.
- **OV5 Conversions.** Each counted conversion and each key event not counted,
  3 at most: those that happened first, then those not counted, then those
  that never happened. Times, value (counted ones only), change, and whether
  it counts. Links to Conversions.
- **OV6 Who visited.** One row for each kind: new or returning, device, age,
  gender, interests, browser, operating system. Each row is the biggest group
  Google could name, its share of all the visits (never of only those Google
  could name, which for gender can be a few: ronins.co.uk read "Male 100%"
  until this was fixed), and that share's move in points on the span
  before. Unknown is never the biggest group shown. Device is
  shown only on every device's figures. Links to Visitors.
- **OV7 Shop.** Only when the website sells (`connection.shop`): the 3 best
  selling products by revenue, with viewed, added to basket, bought and
  revenue. Links to Products.
- **OV8 Tracking health.** The checks that need a look, each with its short
  line, from the checks the connection already holds. All passing says so.
  Links to Tracking health.

## Limits, said

- **3 rows a panel** (`OVERVIEW_TOP`), Who visited's one row a kind apart.
- **No Country row.** The drawing had one. Every figure Hakken keeps is
  already one home country's (§18.6.1), so there is no country to compare
  with. Left out.
- **Device** only reads on every device's figures: with one device chosen it
  would always be 100%.

## Built

Built on dev 2026-10-15:

- `convex/googleAnalyticsOverviewReads.ts`: `analyticsOverviewPanels`,
  `readOverviewPanels`. One query reads every panel from the kept lists
  (channels, campaigns, ad keywords, page classifications, landing pages,
  events, the visitor lists, each device's totals, products).
  `OVERVIEW_TOP` = 3.
- `src/app/(dashboard)/app/analytics/[siteId]/page.tsx`: the page, one
  component a panel. "Where visits came from" as bars and "What changed most"
  are gone from the screen; `analyticsOverview` keeps `changedMost` for What
  Hakken sees and Ask Hakken, and no longer returns `channelVisits`.
- `useVisitorName` moved to `_components/useVisitorName.ts`, shared by
  Visitors and Overview.
- Ask Hakken's Overview answer (`assistantAnalyticsReads.ts`) gains the
  panels' rows and the tracking health checks that need a look, in place of
  every channel's visits.
- Words: `googleAnalytics.overview.*` in English and Italian.
- Tests: `convex/googleAnalyticsOverviewReads.test.ts`; Ask Hakken's
  Overview against the panels in `googleAnalyticsReads.test.ts`; the look in
  `docs/plans/assets/ga-overview/look/Overview.txt`, held by
  `googleAnalyticsLook.test.tsx`. `google-analytics/look/Overview.txt` is
  retired.
