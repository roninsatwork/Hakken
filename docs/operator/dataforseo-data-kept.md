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
