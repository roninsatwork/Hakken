# Core data — each keyword and page once, every screen inside Convex's limits

**Started 2026-10-08. Status: planning — nothing built. Decisions N1 to N10
below: N1 and N2 agreed, N3, N4 and N6 settled (nothing on screen changes),
N5, N7, N8 and N10 agreed too; N9 waits on Anthony.** Follows the
[keep-less-history plan](keep-less-history-plan.md), whose part 8 (built the
same day) packed the numbers and booked addresses inside each stored part —
the steps that could be taken without redesigning how screens read. This plan
is the redesign. Change a decision here, with a date, before building
anything that disagrees with it. Follow `AGENTS.md`.

Anthony, 2026-10-08, on hearing the ready-made lists repeat each keyword in
every list: "it's not good not using data normalisation — why was it not
built this way", then "ok let's plan the data normalisation plan please", and:
"Data normalisation is key to the scalability of this platform, as we can't
move forward onto any features planned in the roadmap until we have the core
working efficiently and optimised." And: "ask any questions, and draw me
screens on the canvas for anything that needs to change." On the order: "I
don't mind as long as it's all covered in the plan overall and at the end
everything is normalised and optimised."

**What "everything" covers.** Three parts, all in this plan: Search Console
(part 1, §5), Sites and DataForSEO (part 2, §6), agents, AI calls and the
rest of the platform (part 3, §7), and every other line of Convex's bill —
function calls, compute, data sent out, scheduled jobs (part 4, §7A) — every one of the database's 234 tables measured, and each
judged: normalised, packed, or left with its reason.

**In plain words.** Each keyword and each page address is stored once — a
keyword once for the whole platform, a page once per website, a company's
private ones once per company — and every list points to it by a number. Facts
that belong to a keyword (its searches a month, its trend, what a click costs)
are stored with the keyword, not copied onto every website that ranks for it.
Screens read only what they show plus what they sort or search on, so a
website five times morehandles.co.uk's size opens every screen well inside
Convex's limits — where today a website two and a half times its size would
fail. Nothing on screen is meant to change.

## 1. Decisions

| # | Question | Recommendation | Status |
|---|---|---|---|
| N1 | How big a website must every screen handle? | **Five times morehandles.co.uk**: 300,000 searches in 90 days and 50,000 pages. Past that, screens keep working and say where a list stops, as Sites' biggest lists do. Proved by a load test at that size (§8). | **Agreed** — Anthony, 2026-10-08, asked for it in this plan. |
| N2 | In what order? | **Search Console, then Sites and DataForSEO, then the rest — all three planned here.** Search Console is the largest per website, private to each company, and nearest its ceiling. | **Agreed** — Anthony, 2026-10-08: "I don't mind as long as it's all covered in the plan overall and at the end everything is normalised and optimised." |
| N3 | When are two page addresses the same page? | **For matching, one rule everywhere: the path, lowercased, without its `#section` or `?…` ending; shown as Google or the crawl gave it.** Today Sites matches the path as written (`pagePath`) and Your pages lowercased (`normalisePage`). | **Settled** 2026-10-08: nothing on screen changes — measured, neither website with Search Console holds two addresses differing only in capitals; Search Console keeps listing morehandles.co.uk's 2,491 `?…` addresses as Google does. |
| N4 | New and lost | **Unchanged on screen**; its register stored as a book (§5.6). | **Settled** — nothing on screen changes. |
| N5 | Brand words | **Judged when the lists are built, not each time a screen opens**: a change to a website's brand words rebuilds its lists, so the brand split shows the new words a minute or two later rather than at once. | **Agreed** — Anthony, 2026-10-08: "that's ok, a small delay is cool". |
| N6 | What a list says past N1's size | **What it says today when a list is cut** (`consoleListRows`): "showing your 25,000 …" — no new words. | **Settled** — nothing new on screen. |
| N7 | DataForSEO's raw answers | **Kept their 7 days in Convex's file storage, not the database**: 33.5 MB of 332 answers, read only to file one again (§6.5). | **Agreed** — Anthony, 2026-10-08: "ok do it". |
| N8 | The Decision Maker's log | **Keep every decision 90 days as now, its probabilities 30**: the probabilities are 4 MB of its 16.9, read only on one admin screen for one run (`chatAdmin.ts:263`). | **Agreed** — Anthony, 2026-10-08: "30 days ok". |
| N9 | Agent transactions (every AI call's cost) | **Keep 90 days, not 400, then daily totals for good**: the analytics read daily totals (`analyticsSnapshots`). 14.4 MB on dev. | Waiting |
| N10 | The Decision Maker judging one at a time | **Judge keywords' intents and pages' types in batches**, tried on a sample first and kept only if the answers match (§7.3). | **Agreed** — Anthony, 2026-10-08: "add this to the plan too please, we need to optimise everything". |

## 2. Why — measured on dev, 2026-10-08

Sizes as Convex counts them (`getDocumentSize`; the measuring tools count
this way since 2026-10-08). **The whole database: 204 MB in 234 tables**
(`storageMeasure:measureEveryTable`). Eleven tables hold 90% of it:

| Table | Size | Part |
|---|---|---|
| `seoPullAnswers` — DataForSEO's raw answers, 7 days | 33.5 MB | 2 |
| `siteKeywordRanks` — each website's rankings | 27.6 MB | 2 |
| `searchConsolePeriods` — Search Console's ready-made lists | 26.1 MB | 1 |
| `decisionRuns` — the Decision Maker's log, 90 days | 16.9 MB | 3 |
| `agentTransactions` — agents' actions and costs, 400 days | 14.4 MB | 3 |
| `keywordPositionMonths` — keyword positions as month lines | 13.8 MB | 2 |
| `searchConsoleSeen` — first- and last-seen register | 12.7 MB | 1 |
| `siteListCopyParts` — Sites' compact copies | 9.1 MB | 2 |
| `siteReferringDomains` | 8.0 MB | 2 |
| `searchConsoleLists` — Search Console's daily lines | 7.3 MB | 1 |
| `siteBacklinks`, `sitePageRanks` | 4.2, 4.1 MB | 2 |

**What costs money is reading and writing, not keeping.** Convex's usage page
for Hakken, 24 September to 8 October: **60 GB read and written**, past the
plan's 50 GB included — against 1.13 GB kept. Most days 1–3 GB; 5 October, the
day of the big tidy, 28 GB. By function: Content gap's writes about 16 GB
(before it was made live on 6 October), Search Console's nightly rebuild about
19 GB, one-off tidies and measurements about 11 GB (the size measure alone
5.6 GB — a measurement reads what it measures, so it is run rarely). Every
part below is judged by what it saves in reading and writing first.

### 2.1 Search Console, morehandles.co.uk

**What its Search Console holds: 43.1 MB**, after keep-less-history part 8.

| Kept | Size | What repeats |
|---|---|---|
| Ready-made lists (`searchConsolePeriods`) | 23.0 MB | Each of 16 lists names every keyword and page in it: "door handles" about ten times. Keyword text 11.2 MB, page addresses 8.8 MB. |
| First- and last-seen register (`searchConsoleSeen`) | 10.5 MB | One row per keyword or page, ~208 bytes, of which the keyword is ~38: the rest is each row's id, website, time and field names. |
| Daily lines, 60 days (`searchConsoleLists`) | 5.6 MB | Since 8.3, keywords once a month (1.5 MB of books) and pages once (2.1 MB of `searchConsolePageRefs`, one row each). |
| Days, weeks, counts | 0.3 MB | — |

**What a screen reads.** Every Keywords or Pages screen reads the whole
period's list, now and before, and sorts, filters, searches and pages it in
memory (`readList`, `convex/searchConsoleLists.ts:356`): Keywords for 90 days
reads 2.6 MB; **Pages competing for 90 days or twelve months reads ~6 MB**
(its list and the keyword list). Convex stops one read at **16 MiB, 32,000
records scanned and 4,096 separate reads** (docs.convex.dev limits, as read
for `sites-table-pages-plan.md` §3.2). So **a website about two and a half
times morehandles.co.uk's size fails on Pages competing today**, and the
others follow soon after.

**What the night costs.** Every ready-made list is written again after each
collection: 23 MB a night for this one website. Convex charges for what is
read and written, not much for what is kept; a design that stores less
rewrites less.

**Why it was built this way.** Search Console's storage went in on
2026-10-02 to the agreed shape of `search-console-plan.md` §14.3 — "a day is
one record, not one per row" — which kept it inside Convex's record limits,
and copies of Google's text in each list, the quick way to make screens
instant without joins. No one measured size until 2026-10-05 (830 MB for this
website, counted as JSON). It has since been cut piece by piece; this plan
puts each fact in one place.

## 3. The rules

1. **Each keyword and page address is stored once per owner**, and every
   other record holds its number. The owner is the company's hold for what is
   private (Search Console, tracked lists), the website for what is shared
   (DataForSEO, the sitemap, the crawl).
2. **One way to clean each**: keywords `normaliseKeyword`
   (`convex/seoJudgments.ts:404`); page addresses the rule N3 settles.
3. **What a screen sorts, filters, groups or joins on is worked out when the
   list is built**, never by reading every row's text when a screen opens —
   the one exception the search box (§5.3), which reads the text of one book.
4. **Every screen inside half of Convex's limits without a search, three
   quarters with one, at N1's size** — proved by a test, not estimated (§8).
5. **Private text never lands in a shared table** (`websiteTenancyGuard.test.ts`
   rules 2 and 3; `private-tracking-lists-plan.md`).

## 4. What exists to build on

- **Keyword books a month** for the daily lines (`searchConsoleKeywordBooks.ts`,
  8.3) and **page references** per hold (`searchConsolePageRefs.ts`, 2A): the
  daily lines are normalised already, and stay as they are (§5.7).
- **Packed numbers and per-part books** (`utils/searchConsolePacks.ts`,
  8.1–8.4): the way every list below stores its columns.
- **Sites' compact copies** (`sites-table-pages-plan.md` §5.2): its answer to
  big lists — a slim copy read whole, the 25 rows shown read in full — and
  its search, **word starts** (T8, agreed 2026-09-25), which Search Console's
  search box already uses (`wordStartMatcher`, `utils/searchConsoleViews.ts:388`).
- **The load test** for Sites at 50,000 keywords (`convex/sitesLoad.test.ts`).

## 5. Part 1 — Search Console

### 5.1 One book a build for the ready-made lists

Each build of a scope's ready-made lists (a settle job: all countries or a
country kept ready, one kind of result) writes **one book** beside them: every
keyword and every page address any of those lists holds, **once, sorted A to
Z**, in records of 1,000 (`searchConsolePeriodBooks`: hold, country, kind of
result, build, `kind` keyword or page, record number, `first` — the record's
first entry — and `terms`). An entry's number is its place in the book.

Because the book is sorted, its numbers **are** the A-to-Z order:

- **Sorting by keyword, top page or next page** sorts by number — no text.
- **Now and before** are joined by number: the two are written in one build,
  against one book.
- **A row on screen** is named by reading the record its number falls in —
  25 rows, at most 25 small reads.
- **A keyword or page asked for by its text** — a keyword's own screen,
  tracked searches, Ask Hakken's `q` — is found with one read: the record
  whose `first` is the last at or before it (index by `first`).

The 7 and 30 days are built each night and the 90 days and twelve months
each week (`searchConsoleSettle.ts`), so a scope has two books alive — the
night's and the week's — each list naming the build it was written with. A
book goes once no list names it.

### 5.2 What a list row holds

| Column | Today | After |
|---|---|---|
| The keyword or page (`keys`) | its text | its number in the book |
| Top page / top keyword (`tops`) | address in the part's `pageBook` / keyword text | its number |
| Pages competing's page (`pages`) | address in `pageBook` | the number of the page **with its `#section` folded in at build** (`pageWithoutSection`) |
| Brand | worked out on every read (`isBrand`) | a flag packed with the row, from the brand words at build (N5) |
| Clicks, impressions, positions, counts, volumes, kinds | packed (8.1, 8.4) | as now |

`pageBook` goes: the build's book replaces it.

### 5.3 How each screen reads

| Screen or reader | Reads today | Reads after |
|---|---|---|
| Keywords, Pages, every view, sorted by a number | the whole list, now and before, with every row's text | the list's numbers, now and before; the 25 rows' names |
| … sorted A to Z | the same | the same: the order is the number |
| … with a search | the same, matching each row's text | **the keyword (or page) book whole**, matching word starts, then as above |
| Pages competing | the keyword list and the competing list, with text, grouped by page text at read | both lists' numbers, grouped by number (folded at build) |
| Page types on Pages (classifications, `pageKinds.kindOf`) | each address at read | the page book whole (a website's pages, 2.5 MB at N1's size) |
| New and lost | the register by day, figures from the 90-day list by text | §5.6 |
| A keyword's or page's own screen, tracked searches, Ask Hakken, Hakken tasks, CSV, fan-out's positions, Your pages, `keptCounts` | the list, by text | by number, after one look-up by text (§5.1) or the book read whole where every row is wanted (CSV, Your pages) |
| The nightly build | the daily lines and their books | as now; it also writes the period book |

### 5.4 Worked out at build instead

The build already reads every line and the website's facts (`factsFor`): it
also sorts the book, folds Pages competing's `#section` addresses into their
page, sets each keyword's brand flag (N5), and gives each list the build it
belongs to. A change of brand words, or of a page's type, asks for a rebuild
of that website's lists (the request already exists: `holdPages.requestRebuild`
is the pattern), so screens catch up within minutes.

### 5.5 The keyword book on a search

The one read that grows with a website is a search: the book whole, matched
word by word. morehandles.co.uk: ~41,000 keywords, about 1.1 MB. At N1's
size: ~200,000 in the twelve months' book, about 5 MB, beside about 4 MB of
list — under three quarters of the limit. Past N1, the search keeps to the
book's first N records and says so (N6).

### 5.6 The register as a book

The register keeps, per country and kind (keyword or page), each entry once in
**sorted records** — text, first day, last day, the days packed as numbers —
split in two when a record passes 1,000 entries, found by `first` as the
period book is. Collection reads the record each seen entry falls in and
writes it back once a step (today: one read and maybe one write per entry,
`noteSeen`, `searchConsoleSync.ts:794`). New and lost reads the packed days of
every record — at N1's size about 5 MB — picks the entries in the dates, and
names only the rows on screen; its search reads the text of the records
holding a match, up to its limit (`consoleNewLostRows`). Its figures join the
90-day list by number, through the period book. **This is the part needing
most care**: its step (§9) starts with a measurement of how fast the register grows.

### 5.7 The daily lines

Unchanged: keywords once a month (8.3), pages through `searchConsolePageRefs`
— whose one row per page (2.1 MB, mostly row overhead) becomes sorted records
as §5.6's, read whole by the build as it is now.

### 5.8 What it would store and read — estimates, to be measured

| | Today | After part 1 |
|---|---|---|
| morehandles.co.uk, Search Console kept | 43.1 MB | **about 15 MB** |
| — ready-made lists and their books | 23.0 MB | about 5–6 MB |
| — register | 10.5 MB | about 2 MB |
| — daily lines, books and page references | 9.2 MB | about 7.5 MB |
| Written each night (the lists) | ~23 MB | ~5–6 MB |
| Read by Keywords, 90 days, no search | 2.6 MB | ~0.8 MB |
| Read by Pages competing, 90 days | ~6 MB | ~1.5 MB |
| Largest website every screen handles | ~2.5× morehandles | 5× (N1), proved |

## 6. Part 2 — Sites and DataForSEO

DataForSEO's data is bought once per website and shared by every company
holding it (`websiteId`, "buying stays shared", `schema.ts:126`); what a
company tracks, and its Search Console, stay its own (rule 5). Measured
2026-10-08: about 14 MB for morehandles.co.uk, about 113 MB across dev.

**What repeats.**

- **A keyword's own facts on every website's row.** `siteKeywordRanks` (27.6
  MB, 31,830 rows) copies onto each website ranking for a search what belongs
  to the search itself: its searches a month, what a click costs, its
  difficulty, its intent, its twelve-month trend (3.7 MB) and what else its
  results page shows (2.5 MB). `searchVolumes` already keeps volume, cost,
  competition and trend once per search and place, and `seoKeywordIntents`
  the intent once per search: the same facts, in three places.
- **A page twice on a row**: `siteKeywordRanks` keeps both `url` (2.3 MB) and
  `page` (1.5 MB); `sitePageRanks` the same.
- **Keyword text and page addresses on every row** of `siteKeywordRanks`,
  `keywordPositionMonths` (each month's pages, 2.6 MB), `siteKeywordFeatures`,
  `sitePaidKeywords`, `websiteSearchStats`, `sitePageRanks`, `sitePageTypes`,
  `siteSitemapPages`, `siteCrawlPages`, `siteBacklinks`, `siteCitedPages`,
  `holdPages`, and the compact copies (`siteListCopyParts`, 9.1 MB of text).
- **Row overhead in lists of small rows.** `siteReferringDomains` (8.0 MB,
  22,709 rows): each row's website, pull and row ids and time are 2.8 MB
  beside 0.6 MB of domains. Referring IPs, subnets, anchors, sitemap pages and
  link days are the same shape.
- **Joins by text.** Search Console finds a keyword's or page's facts in
  Sites by its text (`searchConsoleFacts.keyFacts`), as do Your pages
  (`holdPagesJoin`), Missed demand and fan-out's positions.

### 6.1 Keywords once, for the whole platform

**`keywords`**: one row per search, cleaned by `normaliseKeyword`, with a
number — text DataForSEO answers with, public. **`keywordPlaces`**: one row
per search and place, holding what belongs to the search there — searches a
month, the trend (packed), what a click costs, competition, difficulty, what
its results page shows (booked), its intent. It takes in `searchVolumes`,
`seoKeywordIntents`, and the facts each `siteKeywordRanks` row copies.

A website's ranking row keeps only what is the website's: its keyword's
number, place, position, band, page's number, change, the visits DataForSEO
estimates it gets, first and last seen.

**Privacy (rule 5).** Neither table is read by website, so neither says who
holds a search. Text first met in a company's private list or its Search
Console is never written to them: Search Console looks a keyword up by text
when it builds, reading only, and keeps the number it finds; a search no
website was ever checked for has none.

### 6.2 Pages once per website

**`websitePages`**: every page address a website's shared data names, once,
as sorted records (§5.6's shape), each with its number. `siteKeywordRanks`'
page and previous page, `sitePageRanks`, `sitePageTypes`, `siteSitemapPages`,
`siteCrawlPages`, `siteBacklinks`' target, `siteCitedPages`,
`keywordPositionMonths`' pages, `siteKeywordFeatures` and `sitePaidKeywords`
hold its number; a page's full address is the website's host and its path,
kept once. A company's Your pages (`holdPages`) points to it for every page
Sites knows. Matching follows N3.

### 6.3 Lists of small rows packed

Referring domains, referring IPs and subnets, anchors, sitemap pages and link
days are lists of a text and a few numbers per website and check, each read
whole by its screen (at most 2,500 rows, `sites-table-pages-plan.md` §5.1).
They become packed parts, as Search Console's lines are: the row overhead goes.

### 6.4 The compact copies hold numbers

Sites' copies (`siteListCopyParts`) hold numbers and a book a build (§5.1):
one helper serves Sites and Search Console alike — a book sorted A to Z, its
numbers the order, read whole for a search (word starts, T8).

### 6.5 Raw answers in file storage (N7)

DataForSEO's answers are kept 7 days so a check can be filed again
(`seoPullAnswers`, `keepRules.ts:216`): 33.5 MB for 332, about 100 KB each,
written once and almost never read. They move to Convex's file storage, the
database keeping each answer's pointer: the database's largest table, and its
largest single writes, go.

### 6.6 Joins by number

Search Console's facts, Your pages, Missed demand, fan-out's positions and
the Hakken watchers join Sites by keyword and page number. The two cleaning
rules become one (N3).

### 6.7 What it would store — estimates, to be measured

| | Today (dev) | After part 2 |
|---|---|---|
| `siteKeywordRanks` | 27.6 MB | about 12 MB |
| `keywordPositionMonths` | 13.8 MB | about 9 MB |
| `siteListCopyParts` | 9.1 MB | about 4 MB |
| Lists of small rows (§6.3) | about 10 MB | about 3 MB |
| `seoPullAnswers` | 33.5 MB | pointers only (N7) |
| New: `keywords`, `keywordPlaces`, `websitePages` | — | about 4 MB, taking in `searchVolumes` and `seoKeywordIntents` (4 MB today) |

## 7. Part 3 — agents, AI calls and the rest of the platform

Anthony, 2026-10-08: "Did you cover the agents too". On dev their tables look
small, because agents run little there; what matters is how they grow — with
every AI call, every Decision and every conversation, so with real companies
they become the largest tables, and after Search Console the largest reading
and writing.

**What one call writes, measured 2026-10-08.**

- **Every AI call writes a cost row** (`agentTransactions`, ~360 bytes, kept
  400 days). Of 8,000 rows, 12 purposes and 7 models — yet each row spells
  out its purpose ("decision:seo.keyword-intent") and its model, twice
  (`modelUsed`, `providerModelId`), beside its agent's and company's ids.
- **Every Decision writes two rows**: its own (`decisionRuns`, ~420 bytes,
  kept 90 days, a quarter of it its probabilities) and a cost row. The
  Decision Maker judges keywords' intents and pages' types one at a time:
  7,791 Decisions on 5 October alone, 40,237 in the 90 days kept, and each
  asked which model and mode to use again (`aiModels.resolveModelConfigForExecution`
  36,000 calls and `decisionRuns.resolveModesInternal` 37,000 in two weeks).
- **Every agent step keeps its prompt and answer in full** (`agentLogs`,
  `agentRunSteps`): the agent's standing instructions written out again on
  every call.
- **The job ledger** records every job's start and outcome
  (`jobLedger.runJob` and `recordJobOutcomeInternal`, 73,000 calls each in two
  weeks on dev).
- Chat, the wiki, the library and every other table are under 0.2 MB each and
  already point to companies, agents and subjects by id.

### 7.1 Normalised

- **A call's purpose and model by reference**: a call names its purpose and
  model by a short key from one list each, not in full on every row; the
  model once, not twice.
- **One row per Decision**: the Decision's row carries its cost, and the cost
  ledger counts Decisions from it — not a second row saying the same.
- **An agent's standing instructions once per version**: a step's log keeps
  what was said in that step, and points to the instructions it ran with.
- **Model and mode read once per run, not per call**: a batch of Decisions
  asks once.

### 7.2 Kept for less time, totals kept for good

- **The Decision Maker's probabilities 30 days, the Decision 90** (N8).
- **Cost rows 90 days, then daily totals** per company, agent, purpose and
  model (N9) — the analytics already read daily totals (`analyticsSnapshots`).
- **The job ledger** keeps each job's last outcome and its failures, not every
  successful run — measured first in its step: what reads it, and how often it
  runs.

### 7.3 Fewer calls (N10)

Judging keywords' intents and pages' types **in batches** — one model call for
a few dozen, rather than one each — cuts calls, cost rows and Decisions'
overhead together. It changes how the model is asked, so it is tried on a
sample first and kept only if its answers match the one-at-a-time answers.

### 7.4 Indexes

Convex keeps every index as well as every row, and charges for both. Each
table's indexes are checked against the code that reads them, and an index
nothing reads goes — then a guard fails one added that nothing reads, as
`keepRules.test.ts` fails a table without a keep rule.

### 7.5 Reading and writing, and measuring

The twenty functions reading and writing most in a normal week (Convex's usage
page) each get a target, and the load tests (§8) count what each screen
reads. `storageMeasure:measureEveryTable` runs once a month and before and
after each part — not more, since it reads what it measures.

### 7.6 What it would save — estimates

Per AI call: a cost row from ~360 to ~150 bytes. Per Decision: one row of
~300 bytes instead of two of ~780. On dev today: about 31 MB of the two logs
to about 9 MB; with real companies, the same share of what would be the
platform's largest tables.

## 7A. Part 4 — everything Convex charges for

Anthony, 2026-10-08: "we need to optimise everything". Parts 1 to 3 cut what is
kept and what each screen and build reads and writes; this part takes every
other line of the bill. Convex's usage page for Hakken, 24 September to 8
October (all its deployments):

| Charged for | Used | Included a month | Largest, by function |
|---|---|---|---|
| Reading and writing (database I/O) | **60.3 GB** | 50 GB — **passed** | Content gap's writes ~16 GB (before 6 October), Search Console's rebuild ~19 GB, one-off tidies ~11 GB |
| Function calls | 835,000 | 25 million | `jobLedger.runJob` and `recordJobOutcomeInternal` 73,000 each, `searchConsoleRollups.keptBetween` 58,000, `auth.isAuthenticated` 52,000, `decisionRuns.resolveModesInternal` 37,000, `aiModels.resolveModelConfigForExecution` 36,000 |
| Action compute | 4.8 GB-hours | 250 | to be measured (step 5) |
| Data sent out | 2.87 GB | 50 GB | to be measured (step 5) |
| Kept (database) | 1.13 GB | 50 GB | parts 1–3 |
| Search index | 15 MB | 1 GB | — |

Dev has a handful of websites and almost no users; every line grows with
both, and reading and writing is already past what the plan includes.

- **7A.1 Rebuild only what changed.** The nightly build writes every
  ready-made list again, changed or not; a list whose days and rows are the
  same as the night before is left as it is (compared by a hash of its rows,
  kept with it).
- **7A.2 Fewer, larger reads in the build.** The build pages the daily lines
  in small steps (`keptBetween`, 58,000 calls in two weeks): read in parts as
  large as a read may hold.
- **7A.3 The job ledger** writes a start and an outcome for every job run
  (146,000 calls in two weeks): keep a job's last outcome and its failures,
  and count the rest (§7.2).
- **7A.4 Asked once, not every time**: the AI model and the Decision mode per
  run or batch (§7.1); a signed-in check (`auth.isAuthenticated`, 52,000
  calls) once per screen, not per part of it — measured first: which screens
  ask, and how often.
- **7A.5 Every scheduled job justified**: each cron's how-often against what
  it finds to do; a job that wakes to find nothing costs calls and reads —
  it waits for work, or runs less often.
- **7A.6 Action compute and data sent out** measured by function in the
  normal week (step 5); the largest of each get a target, as reading does.
- **7A.7 A budget each function keeps.** The load tests record what each
  screen and build reads and writes; a function passing its budget fails the
  check, so a change that costs more is seen before it is merged, not on the
  bill.

## 8. How it is proved

- **A load test at N1's size, written first**, in the way of
  `convex/sitesLoad.test.ts`: a company website with 300,000 searches in 90
  days and 50,000 pages, every Search Console screen query run with and
  without a search, recording what each reads. It fails today (§2) — that
  failure is its first commit — and passes when part 1 is in, each screen
  under rule 4's share of the limits and a second.
- **Before and after on dev**: `searchConsoleTidy:keptSize` for every
  website, the night's writes on the Convex dashboard.
- **Same answers**: every list rebuilt from the book compared with the list
  before it, row for row (as 8.3 was, 2026-10-08).
- **On screen**, in Chrome: Keywords, Pages, Pages competing, New and lost, a
  keyword's and a page's own screen, for 7, 30, 90 days and the year, sorted
  each way and searched.
- **Part 2**: `convex/sitesLoad.test.ts` at its own target (50,000 keywords a
  list), counting what each Sites screen reads, before and after; every
  website's rankings compared row for row with the old rows.
- **Part 3**: the measurement before and after; the index guard.
- `npm run check`, GitHub's own steps, and the build, before each merge.

## 9. The work, in order

1. **The load test** at N1's size, failing as today fails — 1 day.
2. **The period book** (§5.1–5.5): written by the build, every reader moved
   to numbers, `pageBook` retired, the lists rebuilt — 3 days.
3. **The register as a book** (§5.6), starting with a measurement of its
   growth — 2 days.
4. **Page references as sorted records** (§5.7), the tidy and the record —
   ½ day.
5. **A normal week measured**: Convex's reading and writing by function,
   the baseline parts 2 and 3 are judged by — ½ day, a week after part 1.
6. **Keywords once** (§6.1): `keywords` and `keywordPlaces`, the rankings
   slimmed, `searchVolumes` and `seoKeywordIntents` taken in — 3 days.
7. **Pages once per website** (§6.2), N3's one rule — 3 days.
8. **Lists of small rows packed** (§6.3) — 1½ days.
9. **The compact copies with numbers** (§6.4), one helper with part 1's books —
   1½ days.
10. **Raw answers in file storage** (§6.5, N7) — ½ day.
11. **Joins by number** (§6.6) — 1 day.
12. **Agents and AI calls normalised** (§7.1): purpose and model by
    reference, one row per Decision, instructions once per version, model and
    mode once per run — 2 days.
13. **Kept for less time** (§7.2, N8, N9) and the job ledger — 1 day.
14. **Decisions in batches** (§7.3, N10), compared on a sample — 1 day.
15. **The index audit and its guard, the reading targets** (§7.4, §7.5) —
    1 day.
16. **Rebuild only what changed, fewer larger reads** (§7A.1, 7A.2) — 1 day.
17. **The job ledger, asked once, every scheduled job justified** (§7A.3–7A.5)
    — 1½ days.
18. **Compute and data sent out, and every function's budget** (§7A.6, 7A.7)
    — 1 day.

**Part 1: about 6½ days. Part 2: about 11 days. Part 3: about 5 days. Part 4:
about 3½ days. In all, about 26 days**, each step merged into `dev` on its own, the full check
first, nothing pushed without Anthony's word.

## 10. Risks

- **Two books alive per scope** (night and week): a list must never name a
  book that has gone. The build writes its book before its lists and clears
  a book only when no list names it; a test holds it.
- **Text look-ups by `first`** depend on one sort order everywhere — the one
  `utils/sortOrder.ts` already uses (`localeCompare`).
- **Brand words and page types change between builds** (N5): screens show the
  change after the rebuild it asks for, minutes later, not at once.
- **The register's writes** move from many small rows to fewer larger
  records: a busy collection writes the same records often. Measured in step 3.
- **The keyword list for the whole platform** is the one table every website's
  rankings point to: written by every check, so additions go a batch at a time
  from the action filing a check, never a row per keyword per mutation.
- **Moving the rankings** (§6.1) touches the Sites screens' every keyword
  table: the copies are rebuilt from the new rows and compared with the old,
  website by website, before the old columns go.

## 11. What changes on screen

**Nothing is meant to change**, so there is nothing to draw. Two decisions
change *when* something shows rather than what: N5 (brand words, minutes) and
N8 (a decision's probabilities, after 30 days, on one admin screen). If any
answer changes what a screen shows, it is drawn on the canvas before it is
built.

## Change log

- **2026-10-08** — Plan written, from Anthony's request the same day. N1
  agreed: five times morehandles.co.uk. Then N2 ("all covered in the plan
  overall"): parts 2 and 3 planned here in full, from the whole database
  measured (`storageMeasure.ts`) and Convex's usage page; N3, N4 and N6
  settled as changing nothing on screen. Then "Did you cover the agents too":
  part 3 rewritten from how agent data grows per call (§7), N10 added. Then
  "add this to the plan too please, we need to optimise everything": N10
  agreed, and part 4 (§7A) added — every line of Convex's bill. N5 agreed:
  "that's ok, a small delay is cool". N7 agreed: "ok do it". N8 agreed: "30 days ok".
