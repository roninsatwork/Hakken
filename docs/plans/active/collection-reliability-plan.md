# Google Analytics and Search Console — a run that always finishes, on any size of website

**Planned 2026-10-15. Status: built — Anthony's go 2026-10-15 ("ok build it please and double check it"), paused
at the stopping point below, and finished overnight on his word ("can you finish this plan tonight while i sleep
and test it in chrome"; "you are welcome to make collections from google to test it works"). Phases 1–3 committed in
3b43c20b; the rest on dev, uncommitted, and live on the dev backend (see "Finished overnight").** Overtakes
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

**Total: about 6 man-days.** Overall: see "Finished overnight".

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

## Finished overnight — 2026-10-15

Each item left above, in its order. Nothing committed or pushed; the backend part is live on the dev backend
(`npx convex dev --once`, 21:21 and after each fix), so the night's real runs use it.

0. **The test-speed check passes** (`npm run test:run`: 7,826 tests, none over 5 s on its own).
   - The cost was the test database, not the run: `convex-test` read every row of every table on each lookup. The
     backend tests now load it with each table's ids kept (`src/test/convexTestTables.ts`, `vitest.config.ts`); its
     own test fails loudly if a `convex-test` upgrade moves the code it changes. The slowest Analytics tests went
     from 9 s to about 5 alone; a rule in AGENTS.md says never to remove it.
   - "A website counted the old way" ran three whole collections; its third — the next morning's — is now planned
     and read, not carried out (what that run asks is the daily run's own test): 9 s to 3.4.
1. **RR3, the rest:**
   - Your pages reads Search Console's 90 days two parts a call, of the newest build, the build's book of pages
     read once a rebuild (`holdPages.consolePagesPart`); its dates come from the build's first part
     (`newestConsoleBuild`), not the whole period and book.
   - The rebuild runs in the Node runtime (`holdPagesSteps.rebuildHoldPages`); a booking of the old one hands on.
   - Each page's daily figures are written at most 100 records and a million characters a call
     (`googleAnalyticsPageSeries.writeBatches`).
2. **RR5:**
   - **The watch's own tests** (`collectionSteps.test.ts`): carried on from the saved place, careful, skipped, only
     the closing, the closing stopped too, a cancelled run, a superseded step refused, the memory line. They found
     that the reason a chain was given up was wiped by its closing's booking; it is kept now.
   - **The kill tests** (`collectionKills.test.ts`, 9): a step stopped where it stands — Google's answer a marker
     the step's own catch cannot read — at Analytics' days, a ready-made list, a page list, three times at one list,
     each two-year fill; Search Console's 90 days, its 16 months, an adding-up job. Each run finishes with its
     closing, its chain closed, "Carried on" on the run.
   - **The guards** (`src/collection-reliability-drift.test.ts`): only the watch books a collection step, and it
     books every kind; every Analytics ask passes its sink (two asks on connecting, small by nature, named); a
     Search Console ask holds at most Google's 50,000 rows; no collector table is read with `.collect()`. Each
     shown to fail on code that breaks it.
   - **A step's memory** is the heap in use, not the process's resident size (`utils/stepMemory.ts`): the
     resident size counts Convex's loaded code and what earlier actions left, and a 50-page rehearsal read 330 to
     410 MB by it — every website's run would have said it was near its limit.
   - **The rehearsal** (`collectionRehearsal.ts`, its pretend Google `utils/rehearsalGoogle.ts`): see below.

3. **The double-check:** an independent review of the whole change (a second agent, reading only). What it found,
   and what was done:
   - **A step the watch replaced could close the chain that replaced it** — no closing passed its booking — and
     the run then died silently. Every closing now passes its booking (`closeChain`, `closeSiteRun`), and an
     Analytics step its watch replaced stops at its next saved place instead of asking Google on.
   - **Carries were counted for the whole run**, so eight heavy jobs anywhere ended it. They are counted since the
     chain last moved on (`bookStep`, `notePlace`); a place still costs at most two before it is left out.
   - **Analytics' skip was not saved** past the ten-second throttle, so a stop at the next job skipped the same job
     again; saved at once now. **The run's end** — page titles and every address's visits — can be left out too.
     **A run given up** keeps the list it had reached for the next night (`listsFrom`).
   - **A run cancelled from Admin**, or given up and stopped in its closing, kept its collecting mark; it goes now
     (`closeSiteRun`, `googleAnalyticsRunEnd.clearCollecting`).
   - Left, low: the hourly sweep reads the 500 oldest open runs of every agent, so with more than 500 open a dead
     collector run would wait; a settle stage left out says so only when it is the chain's last.
   - Confirmed sound: the watch never runs a booking twice; every step is booked through it; the Your pages read;
     the rehearsal's sign-in can never be a real one.

### The rehearsal at 10× kordatackle.com

A pretend property answers as Google's Data API and Search Console answer — 14,000 pages, four devices, three
home countries, 100,000 Search Console rows a day, 800 days of history — worked out from each ask; only a
rehearsal's own sign-in reaches it (`callGoogle`), which no Google sign-in can give. Run from the command line
(`collectionRehearsal:startRehearsal`, `rehearsalReport`, `endRehearsal`), under a company of its own, removed
afterwards; tested end to end at a small size (`collectionRehearsal.test.ts`), the network stubbed to fail.

Run on the dev backend on the night of 15 October, after a small one (50 pages) went through end to end — both
runs, Analytics' two-year fills, Search Console's 16 months and adding-up — in about four minutes. At 10×:

- **Found and fixed, Search Console:** numbering a website's new pages handed back more than a function's answer may
  hold (8,845 against 8,192) on its first day of 14,000 pages: the run's list was never read on past what it had
  added itself (`holdPageRefs.holdSince`, `MOST_RECORDS_SINCE` 28). Any website with more than about 8,000 new pages
  in a day failed its first collection there.
- **Found and fixed, every step:** the memory read was the process's resident size (see above).
- **Held:** Search Console's 90 days at 100,000 rows a day for each home country, a step's memory at most 86 MB;
  Analytics' days and its first 537 ready-made lists for three home countries, at most 308 MB, with Google's row
  limit reached — and said — on 30 lists the pretend website makes bigger than a real one would.
- **The watch, live:** two Analytics steps (lists 536 and 537, a year back, the third country) ran so full they
  passed an action's ten minutes; each was carried on carefully and finished at once alone. A step whose memory has
  grown by a quarter of what a step may hold now hands on to a fresh one between jobs instead
  (`googleAnalyticsAgentRun`).
- **Did not hold — Analytics' page lists on a 14,000-page website.** One page-list job (a part of one date range
  and device) needs more than a step's 512 MB, alone or carefully: each page keeps at least 21 rows while its list
  is read, so its exact top 20 can be stored (ga-big-site-reliability-plan.md BR3) — 294,000 rows at 14,000 pages,
  past the 100,000 this plan holds a list to. The run leaves the list out after three tries, saying so, and goes
  on. It bites above about 2,400 pages; kordatackle.com has about 1,400. Two ways to close it, Anthony's to choose:
  - fewer rows a page while read on such a website (the rest added into its "other" row), so a page there names
    fewer than 20 sources or pages before it; or
  - its page lists asked of Google in groups of pages, keeping every page's top 20, for more asks against the
    property's daily allowance.
  The rehearsal's Analytics run was stopped from Admin there (23:00), which also proved a cancelled run's closing.

- **Search Console at 10×, run to its end:** the 90 days for each of three home countries (100,000 rows a day,
  about 4 hours, a step at most 86 MB, no step stopped), the 16 months' day totals, and every list of video results
  held. **The web lists did not:** each adding-up stage — the 7 and 30 days, built from the 60 days kept; the 90
  days and the 12 months, asked of Google a week at a time — passed an action's ten minutes, carefully too, and was
  left out after three tries, saying so on the run (the "Left out" line added tonight). The run then closed —
  "The days came in, but adding them up stopped … The next run adds them up again" — with its settle ended and every
  chain closed. This is the measurement the list above asked for: **the web lists need building as a stream** of
  the kept days and of Google's weeks, so a step never holds a long period's searches whole. morehandles.co.uk,
  the biggest website collected, is well inside what builds today.
- **A run always finishes (RR1) held at 10× for both collectors**, through two stopped Analytics steps carried on,
  three Analytics lists left out after three stops, a cancel from Admin, and nine Search Console stages carried on
  and left out. What did not hold is RR2 for two kinds of list, Analytics' page lists past about 2,400 pages and
  Search Console's web lists at 10× — both for Anthony to decide how to close (see the two bullets above).
- The rehearsal was removed afterwards (`endRehearsal`): its sign-in forgotten first, its figures cleared as a
  deleted website's are, its company with them. A website removed leaves its chains' rows in `collectionSteps`
  (closed, one a chain): small, but not yet cleared — for later.

### The night's real runs — 16 October

On this code, live on the dev backend, with Google asked as every night:

- **Google Analytics, 01:00.** ronins.co.uk: 83 minutes, 34,888 rows from 967 asks, success. kordatackle.com:
  collected again whole by Google's own counts — 18 July to 15 October, 1,345,789 rows from 1,131 asks — in 96
  minutes, success: the first time it has finished since it was connected. Both waited for the hour's allowance of
  age, gender and interests at 01:12 and carried on at 02:14, as SF17 has them. No step was stopped; the most a step
  held was 129 MB. Korda's closing ran whole: its stale "collecting" mark (from the run the platform ended at 14:00)
  gone, tracking health checked (5 of 12 need a look), and both two-year fills started and finished (02:41,
  03:11) — its "New and returning visitors a day" chart, empty before, is drawn. Checked in Chrome.
- **Search Console, 04:00.** conterraops.com (with its two countries kept ready), ronins.co.uk, kordatackle.com and
  morehandles.co.uk: each its newest days and the last four again, success, inside two and a half minutes all told;
  no step stopped, at most 30 MB. Checked in Chrome.

## Analytics' page lists on big websites — closed 2026-10-16

Anthony chose the groups of pages the same morning ("Let's cap it at 20" for the top rows each page keeps, then
"yes" to asking a big website's pages 2,000 at a time).

- **What changed** (`googleAnalyticsPageLists.ts`, `GROUP_PAGES`): a website numbering more than 2,000 pages first
  asks Google for the pages with any activity in the dates, once a step for each date range, device and country.
  Past 2,000 of them, each page list is asked a group of 2,000 pages at a time — 1,000 on a careful second try — the
  addresses of one page always in one group, so each page's top 20 and its "other" row are kept exactly as on a
  small website. The finished rows are gathered small between groups (`CompactRows`, `googleAnalyticsLists.ts`) and
  packed into the very parts one ask makes. A page's next pages, asked by the page after, choose their top 20 once
  every group is in; the flow chart, which shows the busiest pages of the whole website, gathers every group's
  routes and is worked out once. A website of 2,000 numbered pages or fewer is asked exactly as before, with no
  extra ask; events' lists, keyed by the event, are never grouped.
- **At ten times kordatackle.com** (14,000 pages, pretend Google, measured locally): every page list now holds
  **161 MB at most**, against 516 MB before (pages before and next), 477 MB (pages seen after landing), 291 MB
  (landing page sources) and 279 MB (the flow); the same rows written for each.
- **The same lists, proven:** with a small pretend website asked both ways, every page list writes the same parts,
  part for part (`googleAnalyticsPageGroups.test.ts`); breaking the grouping on purpose fails it. The pretend Google
  now gives a row the same figures however it is filtered, as Google does (`utils/rehearsalGoogle.ts`).
- **On kordatackle.com's real 90 days, nothing written:** Google took a filter of 2,000 pages and a "(not set)"
  landing page alone; every list keyed by page address — 7,851 pages with activity in 90 days, so asked in groups —
  came out identical both ways, as did the flow chart and every landing page list, which it has fewer than 2,000 of.
  Asked again in groups of 500 landing pages, four landing page lists were identical; the pages seen after landing
  and the flow chart differed, because each is trimmed while Google's answer arrives and a smaller group keeps more
  of each page's rows (the flow then held 167,625 visits against 146,917): the grouped lists are the more exact.
- **The cost:** about 5 of the day's 200,000 tokens an ask on kordatackle.com; a list keyed by page address asked
  in its groups took 2 to 4 asks where it took 1 or 2.
- **Found while proving it, and fixed the same morning** (Anthony: "fix it"): a page list's "(other)" row, made
  when a big website's list is trimmed while read, was numbered as though it were a page in the pages seen after
  landing and the events by page — kordatackle.com's page numbering holds `https://kordatackle.com/(other)`, and
  that row could stand among a landing page's top 20 as a page. "(other)" is now never a page address or a page
  number, as "(not set)" never was (`pageAddress`, `numberPages`, the page titles): it stays the page's or event's
  "other" row. Tested by a list cut while read (`googleAnalyticsPageGroups.test.ts`), which fails without the fix.
  The 7 and 30 days' lists are right from the next night's run, the 90 days' and twelve months' from the next
  weekly lists; the address stays in kordatackle.com's numbering, named by no list.

## Change log

- 2026-10-16 — Analytics' page lists past about 2,400 pages closed: a big website's pages asked 2,000 at a time
  (see "Analytics' page lists on big websites"); and a page list's "(other)" row is no longer numbered as a page.
  Uncommitted; on the dev backend.

- 2026-10-15, night — Finished on Anthony's word (see "Finished overnight"): the test speed, RR3's rest, the watch
  and kill tests, the guards, the review and its fixes, and the rehearsal at 10×, which found two limits and fixed
  them and found one — Analytics' page lists past about 2,400 pages — left for Anthony to choose how to close.
  Uncommitted; live on the dev backend for the night's runs.

- 2026-10-15 — Paused at the stopping point above (Anthony travelling).

- 2026-10-15 — Planned from the two code checks; waiting for Anthony's go.
