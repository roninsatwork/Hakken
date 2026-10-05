# What a website costs to run — 5 October 2026

A dated record for pricing (Anthony, 2026-10-05: "store this as we need to
reference it later for when we price strategies"). It holds what Convex
charges, what one customer website's data measured on 5 October 2026 before
and after that evening's work, and what that comes to a month. Like the rest
of this folder it is not kept up to date: supersede it with a later document.

**Measured** means read from the dev deployment by
`searchConsoleTidy:keptSize`. **Estimated** means worked out from those
measurements and the published prices; the real reading and writing is to be
confirmed on the Convex dashboard's Usage page, the first step of the cost
review in [the finish-off plan](../plans/active/finish-off-plan.md).

## Convex's prices, read 5 October 2026

From [convex.dev/pricing](https://www.convex.dev/pricing), the Professional plan:

| What | Included each month | Past that |
|---|---|---|
| The plan | — | $25 per developer a month |
| Database storage | 50 GB | $0.20 per GB a month |
| Database reading and writing ("I/O") | 50 GB | $0.20 per GB |
| File storage | 100 GB | $0.03 per GB |
| Function calls | 25 million | $2 per million |
| Action compute | 250 GB-hours | $0.30 per GB-hour |

Storing is cheap. **Reading and writing is the cost**: each website's
Search Console figures are added up again every night (the ready-made 7-, 30-,
90-day and 12-month lists the screens read), which reads and writes about
the website's whole size each night.

## One website's Search Console data, measured

| Website | Start of 5 Oct evening | After that evening | Smaller by |
|---|---|---|---|
| morehandles.co.uk (a busy shop: 64,360 searches in 90 days) | 830 MB | **205 MB** | 75% |
| ronins.co.uk (a small agency site: 17,848 searches) | 131 MB | **49 MB** | 63% |

morehandles.co.uk after, by part: the ready-made lists 109 MB; the kept
search-and-page lines 39 MB for all countries and 30 MB for the UK; the
first- and last-seen register 18 MB; the page list 7 MB; the rest under 3 MB.

What made the difference (the finish-off plan's item 2 and "store less,
round two"): each page address kept once; image search kept weekly, then
not search by search at all; twelve months not kept twice while it is the
90 days; no "period before" on the click-through lists; New and lost for
web search, all countries, only; page numbers in the two largest lists; and
only the searches that got a click, are tracked, rank in the top 20 or show
two or more of the website's pages.

## What that comes to a month (estimated)

Reading and writing taken as about the website's size each night, 30 nights;
storage at its size. Before any included allowance.

| | Before | After |
|---|---|---|
| **One website like morehandles.co.uk** | about $5.50 a month | **about $1.35 a month** |
| **One website like ronins.co.uk** | about $0.85 a month | **about $0.30 a month** |
| 100 websites like morehandles.co.uk | about $550 a month | **about $135 a month** |
| 1,000 websites like morehandles.co.uk | about $5,500 a month | **about $1,350 a month** |
| 1,000 websites like ronins.co.uk | about $850 a month | **about $300 a month** |

Storage alone is pennies: morehandles.co.uk's 205 MB is about $0.04 a month.
The plan's included 50 GB of each covers the first few dozen websites.

## Beside it, for pricing

- **The plan's price and credits** (agreed 2026-10-05): £200 a month, with
  10,000 credits a month for now; a credit is 5¢ of real DataForSEO cost
  ([usage-credits-plan.md](../plans/active/usage-credits-plan.md)).
- **What DataForSEO costs per website**: what is bought, how often, and each
  request's price — and what a competitor no longer gets — are in the
  finish-off plan's "What we buy from DataForSEO" table. Measured on
  5 October: a full first collection was $13 for Conterra Ops and $17.21 for
  Period House Group; competitors' link lists, keyword pages past 1,000,
  crawls and "who competes with it" are no longer bought, saving about a
  third of a weekly company's DataForSEO bill.
- **Not yet measured**: DataForSEO's stored data per website in Convex (about
  137,000 rows of competitor data were removed on dev on 5 October), and the
  real reading and writing on the Usage page.
- **Later saving, not counted above**: weeks become months after six months,
  about 30 MB a year on a website like morehandles.co.uk once it holds that
  much history.
