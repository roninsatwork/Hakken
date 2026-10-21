# Calendar periods — the audit (2026-10-21)

Anthony, 2026-10-20: "When your done with the plan can you perform a full audit and double check the data." Phase 10
of [calendar-periods-plan.md](calendar-periods-plan.md). A dated record: what was checked, how, what was found, what
was fixed and what waits for Anthony's word. Run on the dev deployment on 21 October 2026, after the start-up fill.

## How it was checked

- **The rules, written twice.** The seven periods, their spans and what each is set against were written again in a
  separate script from the plan's words (not the app's code), and every comparison below uses that script's dates.
  It produced exactly the spans the app stores: the first check passed before any figure was read.
- **Each screen's figures against the stored days**, read through the same reads the screens and Ask Hakken use, for
  every connected website and all seven periods, and compared with the stored days added up independently.

## Search Console — 42 of 42 match

Six connected websites (hurtwoodhouse.com, nec.ac.uk, kordatackle.com, conterraops.com, morehandles.co.uk,
ronins.co.uk) × seven periods. For each: the period's dates, its clicks and impressions, the span it is set against
and that span's clicks — all equal to the stored days added up. This Year has no comparison: the same days last year
are past the 16 months Google keeps, and the screens say so.

Also the same as the screens behind them:
- **The front page** shows Last Month, 1–30 September: Hurtwood's 3,583 clicks equal the audited month, and "44% more
  than the month before" is 3,583 against August's 2,482.
- **The Monday report** reads last week, 12–18 October, against the week before.
- **Ask Hakken's Search Console read** is the read the audit used.

### Found

1. **MoreHandles is missing eight months of days** — 11 August 2025 to 22 April 2026 — though its connection says its
   days are held back to 11 June 2025 (`daysFrom`). The history fetch had asked Google for June 2025 to July 2026 in
   one ask, written what came back and marked the history complete. On Anthony's word ("1 yes pleasee") the gap was
   asked of Google again, day by day, by its own fetch (`refetchHistoryGaps` in `searchConsoleHistoryDays.ts`):
   **Google returned no days for any of it.** Google holds no Search Console data for morehandles.co.uk in those
   months — most likely the property was verified another way (a domain property, or `http`/no-`www`) for that time.
   Not a Hakken fault, and nothing more to fetch. Effect: MoreHandles' This Year counts from 23 April. The screens do
   not yet say the year is part-held — **a question for Anthony** (below).
2. **Conterra holds no days before 13 May 2026**, and 96 of its days held show no impressions: a website Google did
   not show before May. Genuine, not a gap.
3. **Two numbers called "clicks" on Keywords.** The sentence above the figures said "bringing 1,736 clicks" while the
   Clicks figure beside it said 2,478: the sentence counts the searches Google names, the figure every click.
   **Fixed:** the sentence now says "1,736 clicks from the searches Google names" (English and Italian).

## Clarity — the prepared periods match

Ronins' Clarity, connected on 11 October: each period's record starts at its first day held and says how many days
it holds; Last Week's span before (5–11 October) holds one day with no visits, and the screens compare a period only
when the span before holds as many days ("like against like") — so it shows no comparison yet, and says why.

## Google Analytics

Five connected websites (hurtwoodhouse.com, nec.ac.uk, kordatackle.com, ronins.co.uk, morehandles.co.uk), read
after each one's start-up fill finished, through the read the screens and Ask Hakken share.

- **Dates: 35 of 35 right.** Every period's dates equal the rules written separately, and so does every stored span it
  is set against — This Week against 12–13 October (the same two days), This Month against 1–20 September, This
  Quarter against 1–20 July, Last Week against 5–11 October, Last Month against August, Last Quarter against April
  to June (and July to September 2025 a year before), This Year against 1 January to 20 October 2025.
- **Two of Google's lists for the same days agree exactly.** This Month and This Quarter are both 1–20 October and
  are asked of Google separately: visits, page views and conversions are identical on every website.
- **The months add up to their quarters.** Last Quarter less August and September leaves a July that fits July 1–20
  (This Quarter's span before) on every website — for Hurtwood 16,469 visits less 4,898 and 7,953 leaves 3,618 for
  July, of which 2,385 by the 20th; its conversions the same (425 − 91 − 218 = 116, of which 56 by the 20th).
- **The chart's days against the figures at the top** (Hurtwood, the company Anthony is viewing): page views and
  conversions equal exactly for This Week, Last Week, This Month, Last Month and This Quarter — 1,028, 3,226, 10,043,
  18,027 and 10,043 views; 12, 37, 87, 218 and 87 conversions. Visits are within half a percent (1,611 against 1,607
  for Last Week): Google counts a visit that runs past midnight on both days, and its daily counts are estimates.

### Found

4. **Insights' "12 months before" shared a day with its 12 months.** The 12-month list a year before was still dated
   by the old rule — 52 weeks back, for the same weekdays — so it ran 22 October 2024 to 21 October 2025 against 21
   October 2025 to 20 October 2026. **Fixed:** it is now the 365 days before, sharing none; the stored lists take the
   new dates at the next weekly collection.
5. **Hurtwood's Last Quarter and This Year charts are empty today.** This build keeps 92 days as days, up from 90, so
   a whole quarter fits (phase 6). Hurtwood's oldest day held is 22 July, one short of the new reach (21 July, its
   day having gone into its week under the old rule), and the chart draws weeks and months only once the days reach
   it unbroken. The figures at the top are unaffected, and so are the sums (21 July sits inside its week's record).
   **Rights itself at tomorrow's collection**, when the reach moves to 22 July; the other four websites' days already
   reach it. No change made.

## Old answers cleared

On Anthony's word ("3 yes"), every answer prepared for the old 7, 30, 90 and 365 days was deleted from the dev
deployment, and the database now refuses them: Search Console 1,054 prepared lists and 445 records of their use,
Clarity 19 records, Google Analytics every 7/30/90-day list and every 365-day list but Insights' own (each website now
holds 15: Insights' seven lists now and a year before, and the 12-month chart). The one-off sweep was removed after.

## Insights' 12 months (option C)

Agreed by Anthony 21 October ("Yes if it's optimised for speed and storage"): Insights keeps its own 12 months, asked
of Google once a week — seven lists (total, channel, first channel, landing pages, landing pages by channel, events,
new or returning), now and a year before, every device only, never by device, and never the extra "visits that
converted" ask, which Insights does not read. Fourteen asks a week a website; its 30 and 90 days read Last Month and
Last Quarter.

## Waiting for Anthony

- **MoreHandles' Search Console year starts in April.** Google has no days before 23 April 2026 for this property.
  Should the screens say "held from 23 April" on This Year for a website like this? Nothing is changed until he says.

## Known, by design

- **Whole months have different lengths.** A finished month is set against the whole month before (rule 4), so a
  steady website shows September's 30 days about 3% down on August's 31. Agreed in rule 4; worth knowing when a small
  change is read.
- **A quarter's first week on a weekly chart** can begin before the quarter (a week is never cut at the period's first
  day); the chart marks it as part of a week.
