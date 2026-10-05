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
**Where each website stood is kept for ever** (`seoKeywordPositions`,
`siteKeywordRanks`, and the summary `websiteSearchStats`), so positions,
their history and every chart of them are unchanged.

A search checked in the last 90 days shows its results page as before. One
last checked before them — a paused search, or one whose company has not
collected since — shows, on its own page and under Who ranks above you, the website's position at that check and "Google's full results page is
kept for 90 days." in place of the page. Search features and What people also
ask read the pages kept, so such a search drops out of them.
