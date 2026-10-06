# DataForSEO data: what is kept, and for how long

What Hakken keeps of the data it buys from DataForSEO, how long, and what an
operator can no longer do once it has gone. The reasons are in the
[DataForSEO cost plan](../plans/active/dataforseo-cost-plan.md).

## Raw answers — 7 days

DataForSEO's answer to each request, as it came back (`seoPullAnswers`), is
kept for **7 days** (`SEO_RAW_RETENTION_DAYS` in
`convex/seoCollectionPolicy.ts`; 30 days until 2026-10-05). The hourly
collection sweep clears older ones. The request row itself, with its cost, is
kept: it is the record checked against DataForSEO's invoice.

Everything a screen shows is filed from the answer when it arrives, so nothing
a customer sees depends on the raw answer once it is filed. What an operator
can do with it only within those 7 days:

- **File an answer again** — after a parser fix, or when filing failed. The
  hourly sweep re-files an answer that was never filed within hours, well
  inside the week. A request older than 7 days cannot be filed again: buying it
  again is the only way back.
- **Recount credits from what came back** —
  `npx convex run creditCorrections:recountCollectionCredits`. Its first pass
  counts each list or crawl from its kept answer, so it reaches 7 days back;
  an older request keeps what it was counted at. Run it within the week of
  the answers it is meant to count.
- **Read stored answers again for new fields** —
  `npx convex run siteBackfillRaw:readStoredResults` reaches 7 days back.

## AI answers' full wording — 90 days

What an AI assistant said, word for word (`aiAnswerTexts`, and the light row
that lists it, `aiAnswerIndex`), is kept for **90 days**
(`AI_ANSWER_WORDING_RETENTION_DAYS`; kept for ever until 2026-10-05). The
hourly collection sweep clears older wording, a few thousand answers an hour.
**Who an answer named and cited is kept for ever** (`aiAnswers`,
`aiCitations`), so every count and chart built from them is unchanged.

On the screens, an answer older than 90 days is still listed under Full
answers and still opens: how it treated the website and the sources it cited,
with "The full wording is kept for 90 days." in place of its words. A search
of the answers' words finds those of the last 90 days. The Full answers
download lists the answers whose wording is kept.

## Google's full results pages — 90 days

Google's first pages for each tracked search, as each check found them
(`siteSerpPages`), are kept for **90 days** (`SERP_PAGE_RETENTION_DAYS`; kept
for ever until 2026-10-05). The hourly collection sweep clears older pages.
**Where each website stood is kept** (`seoKeywordPositions` — day by day
for 90 days, then each week's last, below — `siteKeywordRanks`, and the
summary `websiteSearchStats`), so positions and every chart of them are
unchanged.

A search checked in the last 90 days shows its results page as before. One
last checked before them — a paused search, or one whose company has not
collected since — shows, on its own page and under Who ranks above you, the website's position at that check and "Google's full results page is
kept for 90 days." in place of the page. Search features and What people also
ask read the pages kept, so such a search drops out of them.

## Keyword positions — day by day for 90 days, then each week's last

Where a website stood on each search at each check (`seoKeywordPositions`) is
kept **day by day for 90 days** (`DAILY_POSITIONS_RETENTION_DAYS`; every day
for ever until 2026-10-06). Before that, each week keeps its last check — a
week runs Monday to Sunday and stops at the end of its month — and the hourly
collection sweep clears the rest of the week (`convex/positionWeeks.ts`). A
keyword list's filings and a tracked search's checks are kept apart, each its
week's last. A search's first and best checks stay in its summary
(`websiteSearchStats`).

On the screens, a position chart by week or by month reads exactly as before:
a week's point was always its last check. A chart by day reaching back past
the 90 days shows one point a week there, and says "Before {day}, one check a
week is kept: each week's last." under its title. Keywords compared with a day
past the 90 days show that week's last check.

The sweep keeps its place in `positionThinning` and reads each day once, the
day it passes the 90 days, never the weeks already thinned. It thins about
thirty thousand positions an hour, so a first pass over a long history takes
some hours, handing itself on each hour.

## Content gap — not stored

Since 2026-10-06 a content gap is worked out when it is read, from the
keyword copies each website keeps already (`convex/siteContentGap.ts`), for
a company's own websites only. Nothing is stored for it: the rows it kept
before (`siteContentGaps`) and their copies are cleared by the data
migration `2026-10-06-drop-stored-gaps`:

    npx convex run dataMigrations:run '{"name":"2026-10-06-drop-stored-gaps"}'

Run it once on each deployment after this release; `siteContentGaps` leaves
the schema once it has run everywhere.
