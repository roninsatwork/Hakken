# Collection reliability plan

Written 2026-09-25, after Korda's collection stalled for 17 hours.

Anthony, 2026-09-25: "I can't emphasise enough how important it is for this
collection process to be robust and reliable. Can you double and triple check
everything please to ensure this key component always works."

The DataForSEO collection is the part everything else stands on. This plan
lists every way it can fail that four independent reviews of the code found:
planning, sending, filing and housekeeping, one review each, read-only. It
says which findings have been checked against the code and which are still
only reported, and the order they will be fixed in.

**Checked** means read in the code and confirmed. **Reported** means found by
a review and not yet confirmed; each is checked before it is fixed.

## What happened

Every stored DataForSEO answer (up to a megabyte) sat inside its request row.
Anything that read many requests read their answers too, and Korda's 149
answers came to 20.5 MB — more than a single Convex function may read (16 MB).
Three things read that way: closing a finished collection, filing the last
answer of a collection, and the hourly check. Each failed and undid itself,
every time, so the site crawl's answer — ready since the evening before — was
never filed and the collection never closed. The error was visible only on
Admin → Health and in the Convex logs.

## Already fixed (2026-09-25)

- Answers live in their own table (`seoPullAnswers`); a request row is a few
  hundred bytes again. The 190 stored answers were moved across without loss.
- A collection's requests are looked up by collection and status through an
  index, never read whole (`cyclePullIn`, `by_cycle_status`).
- The hourly check runs each duty as its own transaction, so one failing duty
  no longer undoes the others.
- An unanswered request is given up after 12 hours, not 24.
- Only a collection with requests still to send holds up a new one.
- Korda's stalled collection: the crawl's answer fetched and filed, the
  collection closed with all 149 answers.
- Close this run, for a collection that will not finish on its own. It never
  deletes a request another company's run still needs.

## Stage 1 — never pay twice, never lose a paid answer

Done 2026-09-25. Tests: `seoCollectionMoney.test.ts` (sending, one Collector
at a time, fetching, late answers, a dead Collector, counting, collections
that stop part-way, answers never filed), `seoCollectionClose.test.ts`,
`seoCollection.test.ts`, `seoCollectionParse.test.ts`.

| # | Finding | Fixed |
|---|---|---|
| 1.1 | A batch's answers were recorded one by one inside the same `try` as the send; one failed record put the rest of an accepted batch back in the queue, to be bought again. | Every outcome is recorded in one mutation (`settleSeoSendBatch`), retried until it lands and safe to repeat; nothing DataForSEO may have is ever released. |
| 1.2 | A 45-second timeout or a dropped connection was read as "not accepted" and re-sent; DataForSEO's live calls take up to 120 s and are charged when they finish. | Live calls are waited for 130 s. A timeout, dropped connection, gateway error (500/502/504) or unreadable reply is an unknown outcome: the request is failed with the reason, never re-sent (`DataForSeoUncertain`, `failUncertainSends`). If DataForSEO did take it, its pingback finds it by its tag and the answer is still filed. |
| 1.3 | A task missing from DataForSEO's reply was re-sent. | Failed as an unknown outcome, not re-sent. |
| 1.4 | A Collector that died between sending and recording left claims the hourly check put back in the queue. | A batch is marked `postedAt` just before it goes; the hourly check fails a dead claim that reached the send and returns only one that never did. |
| 1.5 | Fetching an answer failed it on any error, including DataForSEO's "task in queue" / "task handed" (40601, 40602). | Still-running codes, network errors, refused-for-now and account codes, and task-level faults on their side leave it waiting; only a definite task error fails it; the 12-hour limit is the only give-up, and a late pingback revives a given-up request. |
| 1.6 | Every retry counted a try, rate limits included; an outage, an empty balance or a revoked key failed the whole queue. | 429, 503 and account refusals (40100, 40104, 40200, 40203, 40207, 40210) count no try. The login is checked before anything is claimed. The Collector stops at an account refusal, and after four "not now" replies in a row, saying why in its run. |
| 1.7 | Several Collectors could run at once, each with its own spend limit; a batch could overshoot a limit. | One Collector at a time (`takeCollectorTurn`: the earliest live run sends, a later one stops at once, saying so). A batch is trimmed to what is left of the limit, at what the call has cost on average. |
| 1.8 | A failed expansion page left a collection "writing its list" for ever, blocking every later one. | The hourly check restarts an expansion quiet for 15 minutes from where it got to, and closes it, saying why, after three restarts. |
| 1.9 | A collection capped at its plan limit was treated as finished while it still held unsent requests. | A collection holds up the next while any of its own requests are still to go, whatever its status. |
| 1.10 | The bulk calls were bought every collection and never filed. | No longer bought (Anthony, 2026-09-25) — about 7 cents a collection; the screens take the same figures from `backlinks_summary`. |
| 1.11 | Filing was started from the action after the answer was recorded; only clashes were retried; a judging error marked filed data failed. | Filing is scheduled inside the mutation that records the answer, once. Each filed answer is marked `filedAt`; the hourly check files again any answer recorded and never filed, up to three tries. Keyword judging runs on its own after filing (`judgeKeywordsLater`). |
| 1.12 | `backlinks_history` and `backlinks_new_lost` refused with "Invalid Field: 'date_from'". | Already fixed on 2026-09-23: the two failures date from a test before `date_from` was dropped, and every request since has been answered. |

Counting was corrected on the way (from 2.5): a queued request is counted as
sent once, not again when its answer comes, in the run and in the daily totals;
given-up and switched-off requests are counted as failed.

## Stage 2 — lists and summaries that are right

Done 2026-09-25. Tests: `siteKeywordList.test.ts`, `siteRebuildTurn.test.ts`,
`seoPullAnswers.test.ts`, `dataForSeoLinkParsers.test.ts`,
`seoRunReports.test.ts`, `seoCollection.test.ts`.

| # | Finding | Fixed |
|---|---|---|
| 2.1 | The full keyword list is paged by the organic count while its pages also carry featured snippets, map packs and AI Overview rows, so its tail is never bought, and its completeness is over-counted. | Paged by DataForSEO's `total_count`, every kind of row; each page records what it asked for, what came back, what was left off and the list's total. |
| 2.2 | A list counts as complete before every page is filed, so keywords on a failed or trimmed page are marked lost, then come back as new next week. `markLost` does not re-check the day; the rebuild is not asked for at the list's end. | A day's list is complete only when every page up to its total is filed with nothing left off (`listDayComplete`); `markLost` leaves rows already as new; the rebuild is asked for after each page's figures are written. |
| 2.3 | Two rebuilds of the same site or content gap can delete each other's rows. | One rebuild at a time per site and per content gap (`beginRebuild`, `endRebuild`); one asked for meanwhile waits a minute and tries again; a turn left by a rebuild that died frees itself after 11 minutes. |
| 2.4 | Answers over 512,000 characters are dropped silently; lists lose their tail rows; the limit counts characters while storage counts bytes. | Answers are kept in parts of 900 KB, up to 3.6 MB, and passed between functions as those parts (`seoPullAnswers.ts`); an answer missing a part reads as none, never half of one. Every size is measured in bytes. A list may take 3.2 MB, so a thousand rows of long addresses are no longer cut; rows still left off are counted on the request (`rowsLeftOff`), and an answer too large to keep at all is marked (`rawTruncated`). A results page is still cut to what is read past 480 KB — only the words around each result go. |
| 2.5 | Counts: a queued request is counted as sent twice; given-up and switched-off requests are not counted as failed; overlapping collections count some AI costs twice; a collection served wholly from held data gets no report. | Sent and failed counted once (Stage 1). A page's type is counted for one run only — the one whose request for that website came last before it. A Collector run's sends are read only up to the company's next run. A collection served wholly from held data is finished the one way every collection is, so it gets its report, which says nothing needed buying. |

## Stage 3 — holds as companies grow

Done 2026-09-25. Tests:
`seoCollectionSweep.test.ts`, `seoAgentRuns.test.ts`, `seoCollection.test.ts`,
`seoIdempotency.test.ts`, `seoCollectionReports.test.ts`, `sites.test.ts`,
`siteCrawlDetail.test.ts`, `seoFanOut.test.ts`, `seoKeywordIntent.test.ts`.

| # | Finding | Fixed |
|---|---|---|
| 3.1 | The Planner reads only the first 500 schedules, waits on each company in turn inside one action (10-minute limit), and a run that dies stays "running" for ever. | Companies are read a hundred at a time, every one of them. Every company's work list is opened first and waited for once — a minute however many companies — and a run stops opening more at seven minutes, saying where it stopped. The hourly check closes a Planner or Collector run twenty minutes old and still "running" as failed, saying why, with its workflow execution. |
| 3.2 | Expansion is budgeted on lines written, not reads (Convex allows about 4,096 reads per transaction); one website cannot be split across pages; question calls are uncapped. | A page counts its reads as they happen and stops at 2,500. A website's planning is a run of steps — a question, a search, a call — and a page can stop between any two; the next picks it up at that step (`cursorStep`), without judging the website "collected" by the lines the page before wrote. Questions stop at the cycle's ceiling like every other call. |
| 3.3 | The hourly fetch reaches 200 answers an hour, the answer purge 8 an hour, cycle retirement has no overall budget (can exceed Convex's write limit), and requests are never purged by age. | Each duty takes pages until it is done, its page budget is spent or the check has run six minutes: every answer out an hour is fetched, spaced ten a second; stored answers are cleared eight rows a page, as many pages as there are; retirement deletes at most 2,000 rows a page, retires failed and capped runs as well as finished ones — never one with a request still out — and takes each run's report with it. **Request rows are kept for ever** — Anthony's decision, 2026-09-25: each is the cost record of one request, checkable against DataForSEO's bill, filed data points at it, and it is under a kilobyte. Only the stored answers are cleared, after 30 days. |
| 3.4 | The company Costs screen reads rollups from the table's start; a run report reads every agent step of the company in its window; `requestGapsFor` can schedule over 1,000 functions at once; `recountCitedPages` can read past 16 MB; `readStoredResults` cannot resume. | The Costs screen reads the window's days (`by_day`). A run report reads the Collector's own calls for the company (`by_agent_company_started`). Gap rebuilds are asked for four holds a step. A cited page is recounted under the answer's own question, engine and place, one small job a page (`recountCitedPage`, `by_website_url_question`). The stored-answer backfill hands on to another run at five minutes, from where it stopped. |
| 3.5 | Searches and questions share a 32-bit key: at 10,000 checks a day a collision (one search served another's page) happens about one day in a hundred. | A 64-bit key. Three real pairs of searches that shared a 32-bit key are pinned in `seoIdempotency.test.ts`. |
| 3.6 | Smaller: Live mode judges "due" from what was planned, not answered; the weekly hold ignores location and limits; only 200 of 1,000 searches are checked; crawl detail can be duplicated or wiped; fan-out counts inflate on re-file; keyword meanings can stay unjudged past 500 rows. | "Due" is judged from the newest run that planned the website, only if anything it asked came back. A call held for its own cadence holds only when asked the same way — same place, same page of a list. Every search a website tracks is checked (1,000). Crawl detail is replaced only when fetched whole, cleared whole, and a refusal is tried again three times before the crawl says why. A fan-out search counts once per answer, whenever filed. A meaning is carried onto every ranking and gap, five hundred a step. |

## Seeing what goes wrong

Asked 2026-09-25: "Do we have good observability in the ui to help see what
goes wrong." The agents' own runs are well covered (each call, its cost, why a
run stopped). What happens between runs — fetching and filing answers — was
not: when it failed, nothing said so on any collection screen.

Done 2026-09-25. Tests: `seoRunReports.test.ts`, `seoCollectionMoney.test.ts`,
and the run page, Collection runs and queue screen tests.

| # | Addition | Done |
|---|---|---|
| V1 | A failure fetching or filing an answer is written on the request, and the run page and queue say "could not be filed: …" rather than "waiting". | Each fetch that does not bring an answer writes why on the request (`lastFetch`). A run's report keeps its requests that need a look — failed, answered but not filed, too large to keep, rows left off — and the run page lists them under **Needs a look**, with the reason. The queue marks an answer not filed as **Not filed**, not collected, and says when one was too large or cut. |
| V2 | A request out for hours is flagged on the run page and the queue. | Out over an hour unanswered, a request is listed on the run page — read live, as the page is — and flagged on the queue, each with the last word on its answer. |
| V3 | The hourly check's last result is shown on the Collection runs screen, not only on Health. | A note on the company's Collection runs screen: when the check last ran, and whether it went well, failed (how many times in a row, and why), or is overdue. |

## Progress

Overall: 100%. Stages 1–3 and V1–V3: 100%.

## Change log

- 2026-09-25 — Written from four reviews of the collection path and checks of
  the code, after Korda's collection stalled.
- 2026-09-25 — Stage 1 done: never pay twice, never lose a paid answer (see
  its table). The bulk calls stopped at Anthony's word. 1.12 found already
  fixed on 2026-09-23.
- 2026-09-25 — Stage 2 done: lists paged and judged complete by their real
  total, one rebuild at a time, answers kept in parts rather than dropped, and
  every cost counted once (see its table).
- 2026-09-25 — Stage 3 done but for one decision: the hourly check works
  through what it finds, the Planner reaches every company inside its time,
  work lists count their reads and resume mid-website, 64-bit keys, and the
  smaller faults (see its table). Every tracked search is now checked, not the
  first 200 — more calls for a website tracking more than 200.
- 2026-09-25 — V1–V3 done: what needs a look on the run page, flags on the
  queue, and the hourly check on the Collection runs screen.
- 2026-09-25 — Request rows kept for ever, at Anthony's word (3.3): "Keep them
  for ever."
- 2026-09-25 — **Every run is a full run**, at Anthony's word ("each run should
  be a full run always"). The weekly and monthly holds (and 3.6's param-aware
  hold) are gone, and so is reuse of answers already in: a run buys every call,
  list page, crawl, question and search, sharing only a request still on its
  way. Request keys carry the run. The Sites Overview's headline shows the
  newest value held for each figure, never a dash while one is held.
- 2026-09-25 — Full runs **reverted the same day**, at Anthony's word: "put it
  back to how it was with different collections", "continue to show the
  existing data for things we don't collect", "the data set always looks
  complete and we build on it with incremental". The weekly and monthly
  holds, the reuse ladder and day-keyed requests are back exactly as they were
  (3.6's hold matched on how a call is asked stays). The Overview's newest-value
  headline stays: it is what makes an incremental run look complete.
- 2026-09-25 — Each call with its own cadence is bought on the run nearest
  that cadence, and every run by a company that collects about as seldom as
  the call (`collectsEveryRun`, `repeatDays`): a monthly company's run is the
  full scan; weekly and fortnightly runs buy the lists every run and the
  crawl, anchors and referring IPs every fourth and every other run; a daily
  one buys the lists weekly and the crawl monthly. Held for its whole cadence
  before, a weekly list — bought a few minutes short of seven days earlier —
  was bought every other week on a weekly schedule, and a monthly company
  skipped the crawl after every month of 30 days or fewer. Paged lists reuse a
  still-fresh page as single calls do, so a second press or a second company
  on the same day does not buy one twice.
