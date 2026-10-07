# What keeping less history saved — 7 October 2026

A dated record for pricing, beside
[What a website costs to run](./infrastructure-costs-oct-2026.md): what the
storage work of 7 October 2026
([keep-less-history-plan.md](../plans/active/keep-less-history-plan.md),
phases 1 to 7) measured before and after on the dev deployment, and what it
changes about how a website's data grows. Like the rest of this folder it is
not kept up to date: supersede it with a later document.

**Measured** means read from the dev deployment the same night, by
`seoStorageMeasure:measureSeoStorage` (DataForSEO's tables) and
`searchConsoleTidy:keptSize` (Search Console's): each row's size as JSON,
near enough what is stored. Lookup lists (indexes) are not counted, so the
removed ones saved more than shown.

## What was measured

| What | Before | After | Change |
|---|---|---|---|
| DataForSEO's latest tables (phase 1: unused columns and lookup lists) — rankings, page rankings, search features, Your pages, sitemap pages | 44.8 MB | 38.0 MB | −6.8 MB |
| Keyword positions (phase 3: a line a month in place of a row a check) | 26.4 MB in 69,193 rows | 13.0 MB in 34,498 lines | −13.4 MB |
| Found competitors' day rows (phase 4) | 0.2 MB in 490 rows | none | −0.2 MB |
| Search Console, morehandles.co.uk (phases 5 and 7) | 84.4 MB | 72.2 MB | −12.2 MB |
| Search Console, ronins.co.uk | 20.8 MB | 16.7 MB | −4.1 MB |
| Search Console, conterraops.com | 0.6 MB | 0.5 MB | −0.1 MB |

About **37 MB less on dev**, from about 177 MB. The night's own numbers
understate it: dev holds 90 days of most of what was cut, and the cuts are
mostly to what grows.

## What changes about growth

The larger saving is in what no longer grows without end:

- **Keyword positions**: a point added to a month's line costs about 25
  bytes, where a row cost about 395; past 90 days a month keeps each week's
  last point, past a year each month's last, and nothing is kept past two
  years. A busy website's positions stop growing at about 30 MB, where they
  grew about 130 MB a year.
- **Search Console's lines**: kept 60 days, every kind of result's, and no
  longer rolled into weeks and months for 16 months — about 70% fewer lines
  for a website holding 16 months. The 90 days and twelve months are asked of
  Google once a week, free.
- **Kept for a set time from now on**: Hakken tasks' checks 90 days, settled
  emails 60, the AI's searches by day 12 months, a lost keyword 90 days; a
  collection stopped at its spending limit is now cleared with the rest.
  Every table's rule is in `convex/keepRules.ts`.

## What it means for pricing

Storage was already the small cost ($0.20 a GB a month past 50 GB); reading
and writing is the cost, and less held is less read on every rebuild. The
per-website figures in the October record stand as an upper bound; a website
now settles at a smaller size, which matters most for the websites with the
most keywords and pages.
