# Google Analytics and Search Console — a run that always finishes, on any size of website

**Planned 2026-10-15. Status: being built — Anthony's go 2026-10-15 ("ok build it please and double check it");
paused at the stopping point below, on dev, uncommitted.** Overtakes
the open items of `ga-big-site-reliability-plan.md` and the adding-up part of
`search-console-first-collection-plan.md`; neither is edited.

## Why

Anthony, 2026-10-15, after kordatackle.com's Analytics run stopped: "how can
you make it more robust as we are failing at every run … I don't want to do
this piecemeal."

Nine Analytics and Search Console runs have failed since 5 October. They fail
in four ways:

| When | Website | What stopped it |
|---|---|---|
| 5 Oct | morehandles.co.uk (SC) | One read past Convex's 16 MB |
| 13–14 Oct | ronins.co.uk (GA) ×2 | Google said busy (an hourly allowance) |
| 14 Oct 04:00 | ronins.co.uk, morehandles.co.uk (SC) | One database call too big ("too many system operations") |
| 15 Oct 11:18 | kordatackle.com (GA) | Step killed by Convex |
| 15 Oct 15:00 | kordatackle.com (GA) | Step out of memory (512 MB) on the 90-day mobile page lists |
| 15 Oct 15:13 | kordatackle.com (SC) | Adding-up job past Convex's 10 minutes |

Each was fixed where it broke, and the next run broke somewhere else. Two
checks of the whole code (2026-10-15, one per collector) found why:

1. **Nothing carries a broken run on.** When Convex kills a step, the run's
   place is lost, and no one picks it up. Twenty minutes later the hourly sweep
   marks the run failed. Its closing work never runs. On kordatackle.com this
   left three things wrong:
   - its page still says "Collecting its first 90 days";
   - its two-year fill never started, so "New and returning visitors a day" is
     empty;
   - the next night runs the same lists in the same order, and dies in the same
     place.
2. **Memory and time grow with the website.** Many of Google's answers are held
   whole. Many database calls read or write everything a website has in one go.
   Each fix so far was tested on ronins.co.uk (156 pages) or with a 10-page
   test. Korda has about 1,400 pages, and the next big client may have 10,000.
3. **Jobs collide.** Two adding-up chains can run for one website at once.
   A live run can look dead and be collected again. One step's work can be
   counted twice.

The checks found 16 places in Analytics and 14 in Search Console. Fixing them
one at a time is what has been happening. This plan fixes them by five rules
that every step of both collectors must keep, with a test that fails any step
that breaks one.

## The five rules

### RR1 — A run always finishes

- **A watch on every step.** Each step is booked with a watch, set past the
  longest an action can live. The DataForSEO Collector already works this way
  (`seoCollectorRun.ts`). Its watch becomes one shared part, used by:
  - Analytics' run and both of its fills;
  - Search Console's run, its 16-month fill and its adding-up chain.
- **The run's place is saved after every job,** in the database, not only in
  the next step's arguments. A watch that finds its step dead carries the run
  on from the saved place.
- **A job that dies is tried once more, in smaller pieces.** If it dies again,
  the run skips it and says so on the run: which list, and why. The next night
  starts with that list.
- **One closing, whatever the ending.** Finished, failed, cut short by the
  night, cancelled or killed — every ending goes through the same closing. It:
  - clears the "collecting" mark;
  - notes what was collected;
  - rolls the days on;
  - rebuilds the screens' lists;
  - starts the fills.

  It runs once, however many times it is called. Today a run cut short by the
  night skips half of this, and a killed run skips all of it.
- **A run counts as moving on every step,** not only when it writes a line.
  Search Console's adding-up can go 30 minutes without a line, so it is marked
  dead while still working, and the website is collected a second time.
- **The sweep reads every open run.** Today it reads the newest 50 for each
  agent, so with more websites than that an early dead run is never closed.

### RR2 — Nothing is held whole

- **Every Google answer is read in pages and added up as it arrives, inside a
  fixed amount of memory.** That covers the asks that are held whole today:
  - Analytics: the landing-page flow, where people came from, who visited a
    page, who landed, weekdays, devices, the ready-made lists, the days, the
    day-list fill and page titles;
  - Search Console: the 90 days of keywords and pages, and the 12 months'
    searches.
- **Today's trim keeps 100 rows a page,** so a page list still grows with the
  number of pages: about 280,000 rows on Korda, the whole 500,000 on a
  10,000-page site. It becomes a limit on all the rows held at once, whatever
  the website's size.
- **One list per job.** Analytics' page-list job asks Google 24 times and writes
  17 lists in one step, holding them all to the end. Each list becomes its own
  job, which gives:
  - memory freed between lists;
  - a place saved after each list;
  - a time check before each one.
- **Search Console's collecting steps move to the Node runtime** (512 MB, from
  64 MB), as Analytics' did on 15 October. Today only its adding-up has it.
- **Search Console's 12-month adding-up is saved part-way,** a few weeks at a
  time. Today it starts again from nothing each time it is cut short, so on a
  big website it would never finish.
- **Google's row limit is never passed silently.** An answer that reaches the
  limit (50,000 rows for Search Console, 500,000 for Analytics) is asked again
  in smaller pieces, and the run says so. Today Search Console drops the rows
  past the limit without a word.

### RR3 — Every database call has a fixed size

Every query and write reads and writes at most a fixed number of rows,
whatever the website's size, and anything bigger goes in pieces. The places
that break it today:

- **Search Console:**
  - noting which searches were seen (the likeliest cause of 14 October);
  - looking up search facts, about 1 second a call already;
  - dropping old books, which reads 4,000 records to delete 40;
  - clearing a website's figures. When this fails, the website stays
    "clearing" for ever and is never collected again.
- **Analytics:**
  - swapping a list for its new copy (64 + 64 whole parts in one read);
  - a day's write, whose cap of 100 rows writes duplicates past it;
  - rolling the days on;
  - the tracking-health checks;
  - the pages seen;
  - the history writes.

### RR4 — One job of each kind per website at a time

- A second adding-up chain never takes over from the first.
- The weekly rebuild waits while a website is still being added up.
- A finished part is counted once, however often it is reported.
- The fills are started once, so Google is never asked twice.
- Two steps adding the same new pages wait their turn instead of failing
  after five clashes.

### RR5 — Proven at ten times Korda before a real run

- **A rehearsal on the real backend.** A pretend property answers like a
  website ten times kordatackle.com: 14,000 pages, four devices, three home
  countries, and 100,000 Search Console rows a day. The whole run goes start to
  finish, both collectors, on the dev backend, where Convex's real limits apply
  (the test library doesn't check memory or bytes read).
  - It asks Google nothing.
  - It runs under a test website on dev, removed afterwards.
  - It is a test tool, not a setting anyone sees.
- **Killed on purpose.** In the tests, a step is killed at each kind of job.
  The run must still finish, with its closing work done.
- **Every step writes its peak memory and the most rows one call read.** A step
  past half of a limit writes a warning line on the run, so a website growing
  towards a limit shows weeks before it fails.
- **Guards in `npm run check`:** a Google ask with no running add-up, a
  collection step booked without a watch, or a collection query that reads a
  growing table whole fails the check.

## Limits, each a number in the code

These are my proposals; each is Anthony's to change.

| Limit | Proposed | Why |
|---|---|---|
| A step's watch | 12 minutes after it starts | Past the 10 minutes an action can live |
| Tries of a job that died | 2, the second in smaller pieces | Then skipped and said so |
| Rows of one list held at once | 100,000 | About 65 MB, an eighth of Node's memory |
| Rows one database call reads or writes | 1,000 | Far under 16 MB and 8 MB |
| Warning line | at half of any limit | Shows growth before a failure |
| Rehearsal size | 10× kordatackle.com | 14,000 pages; the next big client may have 10,000 |

## What does not change

- What is collected, how often, and what the screens show.
- Google's allowances: the hour and day budgets, a fifth kept in hand, no
  retry loops on a refusal (AGENTS.md).
- The fills still start after the night's run.
- Nothing is asked of Google while this is built (memory: no pulls until the
  build ends). Re-collecting kordatackle.com is Anthony's go, after the
  rehearsal passes, with the allowance counted first.

## Until it is built

Tonight's Analytics run for kordatackle.com asks for the same lists and will
stop in the same place. Nothing already held is lost.

## Phases

| Phase | What | Man-days |
|---|---|---|
| 1 | RR1 and RR4: the shared watch, the saved place, one closing, both collectors and their fills | 1.5 |
| 2 | RR2 for Analytics: one list per job, a fixed amount held, every ask added up as it arrives | 1.5 |
| 3 | RR2 for Search Console: Node runtime, the 12 months saved part-way, Google's row limit | 1 |
| 4 | RR3, both collectors: every database call a fixed size | 1 |
| 5 | RR5: the rehearsal at 10×, the kill tests, the memory lines, the guards; the full gate with GitHub's steps | 1 |

**Total: about 6 man-days.** Overall: 0%.

## Stopping point — 2026-10-15, evening

Anthony had to travel. The build stopped at a safe point. These tests passed for everything changed:
- the collectors' 1,216 tests;
- the full local check, which was running as the build paused.

The live dev backend runs this code, so tonight's runs use it. Nothing was committed or pushed.

**Done (phases 1–3, and part of 4):**

- **RR1, the watch** (`convex/collectionSteps.ts`, `collectionStepsSchema.ts`). Each chain of steps is one row:
  - one for Analytics' run, its day fill and its page fill;
  - one for Search Console's run, its 16-month fill and each of its adding-up jobs.

  The row holds the next step's own arguments, which are the saved place, its booking number, its tries and its peak
  memory.
  - Every two minutes a cron, `collection-step-watch` in the job ledger, looks at the open chains. A step that Convex
    says has ended without handing on is carried on from its saved place.
  - The second try at a place goes carefully: that job alone, in smaller pieces.
  - The third try skips it, saying so on the run.
  - After 8 carries, only the chain's closing runs.

  *Changed from the plan:* a check of the open chains replaces a timer for each step. A pending timer moved the
  tests' fake clock by 12 minutes during every step, and a check leaves nothing to book or cancel. A dead step is now
  found within about 14 minutes.
- **One closing for Analytics** (`googleAnalyticsRunEnd.ts`, `closeSiteRun`), whatever the ending: whole, days in, or
  none. It clears the collecting mark, rolls the days on, rebuilds the lists and starts the fills, once.
  - A run cut short by the night goes through it too (`noteNightCut` is gone).
  - `finishCollection` now uses the same closing.
- **One settle at a time for Search Console** (`searchConsoleSettling.startSettleParts`, `partDone` by part, `settleEnded`):
  - Each job is counted once.
  - A settle that carries a run takes over from one that doesn't, and the run it replaces is ended, saying why.
  - The weekly rebuild and a screen's catch-up wait while a website's own run is going.
  - The planning moved to `searchConsoleSettlePlan.ts`; `settleSite` is gone.
- **The hourly sweep** reads every open run by its status, and leaves a watched run to its watch.
- **Page numbering** never fails on a clash (`holdPageRefs.placePages`).
- **RR2, Analytics:**
  - Rows held are bounded by `HOLD_ROWS` (100,000) with `keepPerPage`, half that on a careful try.
  - The page lists are 15 jobs for each date range and device (`PAGE_LIST_PARTS`).
  - Every ask is added up as it arrives: who, landed who, weekdays, devices, the flow's routes and its onward visits.
  - The flow's every-page-against-every-landing-page sum is now done once for each pair.
  - A big website's lists are asked a device at a time (`SPLIT_ROWS`, 25,000).
  - The days are written one list at a time, and a big list's a day at a time.
  - The two-year day fill asks a big list a few days at a time and writes 4 records a call.
  - A list cut at Google's row limit says so on the run.
- **RR2, Search Console:**
  - The run's and the 16-month fill's steps run in the Node runtime (`searchConsoleSteps.ts`).
  - A long period's pairs are held within `MOST_PAIRS_HELD` (400,000), the least-seen searches that cannot yet be
    kept going first, and the run says so.
- **RR3, done:**
  - Seen searches are noted 100 a call (was 500).
  - Search facts are looked up 50 a call (was 200), 16 asks side by side.
  - Unused books are dropped one build at a time.
  - A website's books are cleared 20 records a call.
  - Only the book chunks a line needs are read.
  - A day's records are read device by device, with no cap at 100.
  - Rolling the days on handles one list and device a call, 20 records.
  - A list's old copy is removed 12 parts a call until none is left (`dropStaleParts`).
  - The health checks read at most 10 parts of a list.
  - The fill's page count is read from the list's last part.
- **RR5, begun:** each step's memory is kept as its chain's peak (`utils/stepMemory.ts`), with a warning line on the
  run past 256 MB.
- `googleAnalyticsJobs.ts` holds the run's planning helpers, moved out of `googleAnalyticsCollect.ts` to keep it under
  the 1,000-line ceiling.

**Left, in order:**

0. **The test-speed check:** the full check's 7,800 tests pass, but `scripts/check-test-speed.mjs` fails. Several
   Analytics tests take 4–5 s each on their own, against its 5 s line: `googleAnalyticsCountries.test.ts`, the fills,
   products and history tests.
   - One collection with two home countries takes about 4 s and makes 2,112 asks of the fake Google.
   - Already done: one write a day, and one slots read for each step's page-list parts.
   - Next: count those asks by kind against HEAD to find what got dearer, then make the tests or the run lighter. Never
     add them to the slow list.
1. **RR3, the rest:**
   - `holdPages.consolePages` reads the whole 90-day Search Console page period on every call. Read it a part at a
     time.
   - `rebuildHoldPages` holds every source at once, in the default runtime.
   - Each page's daily figures (`collectPageDays`, `writeRecords`) are written 100 pages a call.
2. **RR5:**
   - The rehearsal at 10× kordatackle.com on the dev backend, with a pretend property.
   - The kill tests: a step stopped at each kind of job, with the run still finishing and its closing done.
   - The guards in `npm run check`.
   - Measure Search Console's short periods at 10×. They still read the 90 days' kept lines at once; build them to
     stream if the measurement says so.
3. **Double-check:** an independent review of the whole change, then the full gate with GitHub's steps.

**Found outside this plan, for later:** a Search Console screen's search reads a whole book (`wholeBook`, up to
4,001 records). That passes a read's 16 MB on a website with ten times kordatackle.com's searches.

## Change log

- 2026-10-15 — Paused at the stopping point above (Anthony travelling).

- 2026-10-15 — Planned from the two code checks; waiting for Anthony's go.
