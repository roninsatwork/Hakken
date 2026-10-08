# Core data — each keyword and page once, every screen inside Convex's limits

**Started 2026-10-08. Status: planning — nothing built. Decisions N1 to N6
below; N1 agreed, the rest wait on Anthony.** Follows the
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
screens on the canvas for anything that needs to change."

**In plain words.** Each keyword and each page address a company's website
holds is stored once, and every list points to it by a number. Screens read
only what they show plus what they sort or search on, so a website five times
morehandles.co.uk's size opens every screen well inside Convex's limits —
where today a website two and a half times its size would fail. Nothing on
screen is meant to change.

## 1. Decisions

| # | Question | Recommendation | Status |
|---|---|---|---|
| N1 | How big a website must every screen handle? | **Five times morehandles.co.uk**: 300,000 searches in 90 days and 50,000 pages. Past that, screens keep working and say where a list stops, as Sites' biggest lists do. Proved by a load test at that size (§7). | **Agreed** — Anthony, 2026-10-08, asked for it in this plan. |
| N2 | In what order? | **Search Console first** (part 1, §5): the largest per website, private to each company, and the one near its ceiling. **Sites and DataForSEO second** (part 2, §6), measured first, with its own decisions — it is shared per website across companies, which changes what may be stored once. | Waiting |
| N3 | When are two page addresses the same page? | **One rule everywhere for matching: case and the `#section` ignored, the address shown as Google or the crawl gave it.** Today Sites keeps case (`pagePath`) and Your pages ignores it (`normalisePage`), so `/Door-Handles` and `/door-handles` are one page in one screen and two in another. | Waiting |
| N4 | New and lost | **Unchanged on screen**; its register stored as a book (§5.6). | Waiting |
| N5 | Brand words | **Judged when the lists are built, not each time a screen opens**: a change to a website's brand words rebuilds its lists, so the brand split shows the new words a minute or two later rather than at once. | Waiting |
| N6 | What a list says past N1's size | **What it says today when a list is cut** (`consoleListRows`): "showing your 25,000 …" — no new words. | Waiting |

## 2. Why — measured on dev, 2026-10-08, morehandles.co.uk

Sizes as Convex counts them (`getDocumentSize`; the measuring tools count
this way since 2026-10-08).

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
   quarters with one, at N1's size** — proved by a test, not estimated (§7).
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
most care**: §8 starts it with a measurement of how fast the register grows.

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

## 6. Part 2 — Sites and DataForSEO (after part 1)

Measured the same day: DataForSEO's tables hold about 14 MB for
morehandles.co.uk and 113 MB across dev. Keyword text and page addresses
repeat across `siteKeywordRanks`, `keywordPositionMonths`,
`siteKeywordFeatures`, `sitePaidKeywords`, `websiteSearchStats`, `sitePageRanks`,
`siteBacklinks`, `siteCrawlPages`, `holdPages` and the compact copies — but
here they are a small share of each row (a keyword is ~25 of
`siteKeywordRanks`' ~850 bytes), so the gains are as much in the rows' own
shape (a keyword's `trend`, a page kept as both `url` and `page`) as in
storing text once. Search Console is joined to them by text today
(`searchConsoleFacts.keyFacts`, `holdPagesJoin`, Missed demand, fan-out).

Its own plan, measured first, answers: a keyword list shared by every website
(keyword text is DataForSEO's, public — `seoKeywordIntents` and
`searchVolumes` already hold one row per phrase), a page list per website,
how text from a company's private lists is kept out of both (rule 5), and
joining Search Console to Sites by number. Not started until part 1 is in.

## 7. How it is proved

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
- `npm run check`, GitHub's own steps, and the build, before each merge.

## 8. The work, in order

1. **The load test** at N1's size, failing as today fails — 1 day.
2. **The period book** (§5.1–5.5): written by the build, every reader moved
   to numbers, `pageBook` retired, the lists rebuilt — 3 days.
3. **The register as a book** (§5.6), starting with a measurement of its
   growth — 2 days.
4. **Page references as sorted records** (§5.7), the tidy and the record —
   ½ day.
5. **Part 2's plan** (§6), measured — 1 day, then its own estimate.

**Part 1: about 6½ days.** Each step merged into `dev` on its own, the full
check first, nothing pushed without Anthony's word.

## 9. Risks

- **Two books alive per scope** (night and week): a list must never name a
  book that has gone. The build writes its book before its lists and clears
  a book only when no list names it; a test holds it.
- **Text look-ups by `first`** depend on one sort order everywhere — the one
  `utils/sortOrder.ts` already uses (`localeCompare`).
- **Brand words and page types change between builds** (N5): screens show the
  change after the rebuild it asks for, minutes later, not at once.
- **The register's writes** move from many small rows to fewer larger
  records: a busy collection writes the same records often. Measured in step 3.

## 10. What changes on screen

**Nothing is meant to change**, so there is nothing to draw yet. If a
decision changes what a screen shows — N3 merging pages whose addresses differ
only in capitals, or N5's short delay — it is drawn on the canvas before it
is built.

## Change log

- **2026-10-08** — Plan written, from Anthony's request the same day. N1
  agreed: five times morehandles.co.uk.
