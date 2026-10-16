# Search Console — the web lists built as a stream, on any size of website

**Planned 2026-10-16; Anthony's go the same morning ("Ok go"). Status: SL1 to SL4 and SL6 built on local dev and
proven, SL5 not needed (see "Built and proven, 2026-10-16"); the rebuild at 10× with SL4 running.** Anthony asked
for it the same morning ("2 yes pls"), after the rehearsal at ten times kordatackle.com showed Search Console's web
lists could not be built at that size (collection-reliability-plan.md, "The rehearsal at 10×"). Change a decision
here, with a date, before building anything that disagrees with it.

## Built and proven, 2026-10-16

- **SL1 and SL2** (`searchConsoleKeptSums.ts`, `utils/searchConsoleSums.ts`, `utils/searchConsoleChartDays.ts`):
  the kept days are read a day at a time and added, by number, into every short period, the charts' days, weeks
  and months with their volatility, the fan-out's 14 and 28 days and the last week's days for the volatility day.
  At ten times kordatackle.com, measured locally: 94 MB held at most, against 256 MB for the days alone before.
- **SL3** (`searchConsoleLongLists.ts`, `PairSums`): Google's weekly answers are added into each long period by
  number, a cut week's days into the week as each comes in, and the searches past the most held let go by the same
  rule, in the same order. The 90 days and the 90 days before at ten times kordatackle.com, on the pretend Google:
  **119 MB held at most, against 403 MB**, the same 45,023 rows a period with the same figures. The cap stays
  400,000 pairs a period.
- **SL6, proven three ways:**
  - equality tests built both ways from the same days, with ties, gaps, empty days, brand searches, cut weeks and
    searches let go past a small cap (`searchConsoleKeptSums.test.ts`, `searchConsoleLongLists.test.ts`); a test
    broken on purpose — the searches let go most-seen first — fails three of them;
  - every list of ronins.co.uk, morehandles.co.uk and kordatackle.com worked out both ways on the dev backend, from
    the same kept days and Google's answers, writing nothing: **155 checks, about 750,000 rows, no difference** —
    web, video, news and Discover; the 7 and 30 days and those before, the charts, the fan-out, four volatility
    days, the page, country, device and appearance lists, and the 90 days and those before asked of Google;
  - every Search Console and collection test: 253, all passing.
- A page, country, device or appearance list cut for its period is now added up a week at a time as the weeks come
  in, not held whole first.
- **The rehearsal at 10× run again** (Search Console alone, 06:55 to 09:45 on the dev backend): every adding-up job
  finished, none stopped by the platform, a job at most 144 MB — the 7 and 30 days, the charts, the 90 days and
  every video list for all three home countries, and the twelve months for Ireland and the USA. The night before,
  every web list failed. One did not fit: the main home country's **twelve months of web pairs** ran past its job's
  time. Measured locally, those twelve months are 834 answers from Google and about 20 million rows added up — 32
  seconds here, past 7 minutes on the platform with three countries' jobs side by side, and with real Google's
  second or so an answer, 4 to 9 minutes of waiting alone.
- **SL4, as the stage that failed needed it** (`PairsPaused`, `PAIRS_RESERVE_MS`): a long period's pairs pause
  three minutes before their job's time is up, their running sums saved to the backend's file storage, and a job
  of the same stage carries on from that week — as many as it takes, each adding a batch of weeks at least. The
  sums are saved and restored exactly, the weeks added in the same order, so the lists are those one long job
  makes: proven paused after every batch, job after job (`searchConsoleLongLists.test.ts`; broken on purpose, it
  fails), and through the whole settle (`searchConsole.test.ts`). The job that finishes the pairs keeps three
  minutes for the lists after them, or hands them whole to a job of their own. The saved sums are a file the
  server stores itself, the second kind after DataForSEO's answers (Anthony, 2026-10-16: "do it", to allowing them;
  `uploadIngressGuard.test.ts`): each lives minutes and is let go by the job that carries it on — the 10× rebuild
  that afternoon left none. One pass over each row less: a cut
  week's days are added straight into the week — Hakken's own share of the twelve months 22.6 seconds to 15.7.
- **SL5 is not needed:** no job held more than 144 MB; a kind's lists waiting for its book cost nothing that shows.

## Why

Every night Search Console's run collects each website's newest days. Then, after a first collection and once a
week, it *adds them up* into the ready-made lists the screens read: the keywords, the pages, Pages competing, the
countries, devices and rich results, each for the last 7, 30 and 90 days and 12 months and the span before, plus the
charts' days, weeks and months and the volatility day.

At ten times kordatackle.com (14,000 pages, 100,000 search rows a day, three home countries), on the dev backend
on 15–16 October:

- the days came in for all three countries, about four hours, a step never above 86 MB;
- every list of **video** results was built;
- every **web** list was not: the 7 and 30 days, the 90 days and the 12 months each passed an action's ten minutes,
  carefully too, and were left out after three tries. The run said so and ended — "The days came in, but adding
  them up stopped … The next run adds them up again" — so the screens would have kept showing nothing for them.

The websites collected today are well inside the size that builds: morehandles.co.uk, the biggest, about 40,000
keywords and 9,000 pages over 90 days, builds each night. This plan is for the next websites, which may be ten
times Korda.

## Why it does not fit

Reading the build (`searchConsolePeriods.buildSitePeriods`) for one kind of result in one country:

1. **Every kept day is read whole before anything is added up.** `readKept` reads the 60 days kept — 90 on a
   first collection — of keyword-and-page lines, unpacks each, decodes each keyword and page to its text, and
   copies them once more to decode the pages: every row of every day held at once. At 10× that is millions of rows,
   when the *different* keywords and pages are a small fraction of that.
2. **Then it is added up again for each period.** The 7 days, the 30 days, the span before each, the fan-out's 14
   and 28 days, the volatility day, and each chart day, week and month (`chartFigures`) each go back over the kept
   days and build their own sums — the same rows added up a hundred times.
3. **The long periods hold their sums as objects.** The 90 days and the 12 months are asked of Google a week at a
   time (`longListRows`), added into running sums — a map of text keys to objects, one per keyword and page — for
   each period at once, up to 400,000 pairs each (`MOST_PAIRS_HELD`), about 120 MB a period.
4. **A kind's lists all wait for its book.** Each list's parts are held until the kind's book of keywords and
   pages is written (`writeHeld`), because a list stores places in the book.

## The rules

### SL1 — Each kept day read, added in, and let go

The kept days are read **one day at a time** and added into the running sums of every period that day belongs to,
then dropped. Nothing holds more than one day's lines and the sums. The charts' days, weeks and months, the
volatility day and the fan-out's 14 and 28 days are periods like the others: one pass over the days fills them all.

### SL2 — Sums held as numbers, not text

A running sum is held by **number**: each keyword and each page given a number the first time it is seen in the
build, and a pair kept as the two numbers, its clicks, impressions and position sum in columns of numbers. About
30 bytes a pair against more than 200 today. The texts are kept once each, in the build's own list of terms, which
becomes its book.

### SL3 — One pass over Google's weeks for every long period

The 90 days, the 90 days before and the 12 months are asked of Google a week at a time, as today — **the same
asks, no more** — and each week is added into every long period it belongs to as it arrives, by number (SL2). The
cap of 400,000 pairs held a period stays, now about 12 MB, and is said on the run when reached, as today.

### SL4 — One period a job, its place saved

The settle's three jobs a kind of result (the short periods, the 90 days, the 12 months) become **one job a
period**, each booked through the watch (`collectionSteps.ts`) with its place saved, so a job the platform stops is
carried on at its own period, not the whole stage, and a period left out after three tries is that period alone.

### SL5 — Lists written as they are finished

The book's terms are known once the pass is done (SL2), so the book is written first and **each list is written
as soon as it is worked out**, in places, not held until every list of the kind is ready.

### SL6 — Nothing on screen changes

The same lists, the same figures, the same keep rule, the same Google asks. Proven by building today's way and the
new way side by side on the same days and comparing every list, figure by figure (phase 5).

## Limits, each a number in the code

These are proposals; each is Anthony's to change.

| Limit | Proposed | Why |
|---|---|---|
| Kept days read at once | 1 | A busy day is the most a step holds of the lines |
| Pairs held a long period | 400,000, as today | Now about 12 MB, not 120; said on the run when reached |
| Periods a settle job builds | 1 | A job stopped by the platform costs its own period only |
| Memory a step may grow before handing on | a quarter of 512 MB, as Analytics' run steps since 15 Oct | Shows long before a failure |

## What does not change

- What is collected, how often, and what the screens show (SL6).
- The 60 days kept, the keep rule, the books' format, the screens' reads.
- Google's asks: the same weekly pieces, the same number of them.
- Video, news, Discover and Google News lists, which already build at 10×, go through the same new path.

## Phases

| Phase | What | Man-days |
|---|---|---|
| 0 | Measure first: the three stages at 10× on the pretend Google, run locally with a memory and time profile, to confirm which of the four causes above costs what | 0.25 |
| 1 | SL2: sums by number, the build's own list of terms | 0.5 |
| 2 | SL1: kept days a day at a time into every short period, the charts, volatility and the fan-out's days | 0.75 |
| 3 | SL3: Google's weeks into every long period, by number | 0.5 |
| 4 | SL4, SL5: one period a job through the watch; the book first, each list written when done | 0.5 |
| 5 | Proof: old and new built side by side on ronins.co.uk's, morehandles.co.uk's and kordatackle.com's days, every list compared; the rehearsal at 10× run again until every web list is built; the full gate with GitHub's steps | 0.5 |

**Total: about 3 man-days.** The 1 to 1½ said on the night of 15 October was before reading the build closely: it
also feeds the charts, volatility, Pages competing and the books, and each must come out the same.

## Before it is built

The 10× gap only matters for a website far bigger than any collected today. Until this is built, such a website's
Search Console run still finishes every night — its days in, the left-out lists said on the run — and its web
screens show the lists from its last good build, or none on a first one.

## Found while planning, for later

- A Search Console screen's search reads a whole book (`wholeBook`, up to 4,001 records): past a read's 16 MB on a
  website with ten times kordatackle.com's searches (collection-reliability-plan.md, "Found outside this plan").

## Change log

- 2026-10-16 — Planned from the rehearsal's results and a reading of the build; waiting for Anthony's go.
- 2026-10-16 — Go given ("Ok go"). SL1, SL2, SL3 and SL6 built and proven; SL4 and SL5 held for the rehearsal run
  again (see "Built and proven").
- 2026-10-16 — The rehearsal run again: every list but the main country's twelve months of web pairs built at 10×.
  SL4 built for that stage — its pairs pause and the next job carries them on; SL5 not needed.
