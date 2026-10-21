# A shop's baskets, by shoppers

Anthony, 2026-10-21, on MoreHandles counting basket adds as conversions: "i think for shops it would be good to
understand basket abandoned rate etc". Asked whether to count by shoppers (visits) or by products, he answered "yes
please" to shoppers; the drawing was approved with "go" the same day. Built on `dev`, not committed.

The approved drawing: [Products-approved.png](../assets/shop-baskets/Products-approved.png) — MoreHandles, Last Month
(September 2026), drawn on the real screen in Anthony's Chrome with the app's own parts and the dev database's figures.

## What Products shows now

Every shop's Products page (Google Analytics → Products), for whatever dates, device and home country are chosen:

- **The four steps count shoppers.** Visits that looked at a product, added to the basket, started checkout and
  bought — each against the span before, each with the share of the step before. The times each happened stay beside
  them ("56,495 looks at a product", "added 18,344 times"), and the products table still counts products.
- **What was left.** "Left in the basket": the share of the visits that added something and left without buying.
  "Left at checkout": the share of the visits that started checkout and didn't finish. Each says how many of how many,
  and moves in points on the span before; fewer is better (green when it falls), as Overview's bounce rate does.
- **The shop's steps** bars count visits, each bar's figure written on it.
- **Shoppers at each step**, a day, week or month as chosen: a line each for the visits that added to the basket,
  started checkout and bought. The gap between the top and bottom lines is the baskets left.
- **What Hakken sees** speaks in the same counts: the visits that looked and added; the baskets left, against the span
  before; the checkouts not finished, against the span before. Three sentences at most, as every box: the product
  looked at often and rarely bought keeps its step under "Do first" ("Look at the page for …"), and "find out why
  checkouts aren't finished" shows when under half the visits that started checkout bought.
- **Ask Hakken** reads the same: each step in times and in visits, and the baskets and checkouts left, now and before.

## Where the figures come from

Nothing new is asked of Google. The events list each collection already keeps holds, for every period and the span
before, how many times each event happened and how many visits had it (`sessions`): `view_item`, `add_to_cart`,
`begin_checkout` and `purchase`. The chart reads the same from the events' days, weeks and months kept
(`googleAnalyticsDays`, `googleAnalyticsHistory`), so it fills in for a website as its events' two years are.

## Limits, said plainly

- **A shopper is a visit.** Someone who adds to the basket on Monday and comes back to buy on Tuesday counts as a basket
  left on Monday and a sale on Tuesday, as Google counts it.
- A visit that adds twice counts once; one that buys twice counts once.
- The chart's days add up to Google's own figure for the period to within a few visits: a visit that runs past
  midnight counts on both days.

## Fixed beside it

- **This Year's monthly charts began with "December 2025".** A week held whole that runs into the next month (29
  December to 4 January) was filed by its first day. It is now the month most of its days are in, in every Google
  Analytics chart (`stepKey`, `stepScale.ts`) — found checking this screen on This Year.

## As built

- `convex/googleAnalyticsProductReads.ts`: each step's `visits` now and before; `shoppers` a day.
- `convex/utils/sees/analyticsProducts.ts`: `leftWithout`; the box by shoppers (`basketsLeft`, `checkoutsLeft` and
  their forms with nothing before), replacing `fewFinished` and `finished`.
- `convex/assistantAnalyticsReads.ts`: Products' answer with `visits`, `basketsLeftPercent`, `checkoutsLeftPercent`.
- `src/app/(dashboard)/app/analytics/[siteId]/products/page.tsx`: the figures, bars and chart as drawn.
- The approved outline: `docs/plans/assets/google-analytics/look/Products.txt`.
