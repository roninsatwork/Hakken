# Sites — numbered table pages with exact totals

**Started 2026-09-25. Status: built 2026-09-25, all five phases, committed and
pushed to dev on 2026-09-26 — see §9 for what was built and how it was checked.** Every decision (T1–T11)
is agreed. Follows [the Sites plan](user-sites-plan.md)
and changes one of its rules (D15, "Counts and totals are stored, not
counted" — see §8). Change a decision here, with a date, before
building anything that disagrees with it. Follow `AGENTS.md`.

Anthony, 2026-09-25, showing Ahrefs' Organic keywords table: "we need to look
at the table paginated footers, some of the results in the tables will be
very long and I love the way Ahrefs do theirs. Is this possible for us across
the entire Sites section on the frontend?" Then: "how can we make it scalable
and reliable and don't have catches", and "can you make a documented plan on
the repo to avoid drift".

Progress: **built** (all five phases, 2026-09-25); committed and pushed to dev on 2026-09-26.

## 1. Decisions

| # | Question | Decision | Status |
|---|---|---|---|
| T1 | Where | **The Sites section only** (`/app/sites` and every page under a site). Admin and every other screen keep today's footer, untouched. Anthony, 2026-09-25: "It's only the sites section". | Agreed |
| T2 | Rows per page | **25, 50, 75 or 100.** Never more than 100 rows on screen at once, which is also the most the server hands over (`SITE_PAGE_MAX` in `convex/siteAccess.ts`). Anthony, 2026-09-25. | Agreed |
| T3 | Rows when a page opens | **25.** Anthony, 2026-09-25: "Yes this is the default". Replaces fifteen for the Sites tables; the fifteen-row rule in `AGENTS.md` is for admin tables. | Agreed |
| T4 | Is the choice shared? | **One choice per page.** Each Sites page keeps its own. Anthony, 2026-09-25: "One per page". Kept in this browser for that page, and carried in the address so Back from a record returns to it. | Agreed |
| T5 | The look | **Ahrefs-style**: numbered pages with "…", the last page number, arrows, the count, and the rows choice. §2. | Agreed |
| T6 | What "no catches" means | **Every Sites table shows its exact total and opens any page straight away, with any search and filters on**, and no list stops short without saying so. | Agreed |
| T7 | How the big lists get exact totals | **A compact copy of each big list**, rebuilt when the list changes; lists that can never pass 1,000 rows are read whole instead. §5. | Agreed |
| T8 | How search matches | **Word starts, on every word typed**: "rod" finds "rods" and "rod pod" but not "products"; "carp ro" finds "carp rods". Works with any sort, and the total is exact. Not plain "contains", which would match "rod" inside "products". §3.3. | Agreed |
| T9 | What "All keywords" counts | **Only the searches seen at the site's latest keyword check.** The page says "Every search it ranks for", so its total must mean that. Searches last seen before then go under their own filter, "Not in the latest check", with the day they were last seen — not deleted, and not called lost when the list is held below the site's real total, because they may still rank below that limit. Searches known to be lost keep the Lost filter. The exact rule, per kind of check, is pinned down in phase 3. | Agreed |
| T10 | Wins and losses | **The list shows the moves at the latest check**, the same ones its menu numbers count, as the page's own question says ("Which searches moved at the last check?"). Today they disagree (§3.3). | Agreed |
| T11 | Lists with a quiet ceiling | **Show everything**; if a list ever outgrows what can be shown, the screen says where it stops. §3.4. | Agreed |

T6–T11 are Claude's recommendations for the best experience, agreed by
Anthony on 2026-09-25: "I will go with your recommendations for the best ux".

## 2. The footer

What every Sites table ends in, whatever kind of list it is:

- **Left:** `‹ 1 2 3 4 5 … 31 ›`. The first and last page always show, with
  the page either side of the current one; "…" stands for the rest, and never
  for a single page. On page 10 it reads `‹ 1 … 9 10 11 … 31 ›` — seven
  places, whichever page is open (`pageSlots` in
  `src/ui/components/screens/pagination.ts`). On a phone the footer stacks:
  the numbers above, the count and the rows choice below.
- **The current page** is lit the way the current page is in the Sites side
  menu (`NAV_ACTIVE_PILL`, `src/ui/components/layout/navStyles.ts`), not in
  brand orange: orange is kept for a page's one main action.
- **Right:** "Showing 751–775 of 1,511", then the rows choice (T2), a `Select`
  from the screen kit.
- **Changing the rows keeps your place**: the first row you were looking at
  stays on screen (rows 51–75 at 25 a page become page 2 at 50).
- **Loading**: the rows on screen stay until the next page arrives, rather
  than flashing the loading row.
- **Empty**: no numbers, the table's own empty message.
- **One page**: no numbers.
- **Accessible**: a `nav` named for the table's pages, each number a button
  saying which page it opens, the current one `aria-current="page"`.
- **In the address**: the page (as today, `useSiteTablePage` in
  `src/app/(dashboard)/app/sites/_components/useSiteParam.ts`) and the rows.
  The address wins over what the browser remembers (T4).

**Where it lives.** The kit's paged footer (`PaginationFooter` in
`src/ui/components/screens/Table.tsx`, chosen by `DataTable`) gains a numbered
variant and a rows choice that a table switches on. Only the Sites tables
switch them on; the 75 other files using the paged footer are unchanged
(T1). Extended, not forked (`AGENTS.md`, "Reuse before you build").

## 3. Today (2026-09-25)

### 3.1 The 36 Sites tables

All 36 use the same paged footer: "Showing 1–15 of N", Previous, Page X of Y,
Next. Every one of them reads its rows through an index on the server. They
differ only in how much the server sends at once.

**22 small lists, sent whole.** Each is capped on the server and paged in the
browser, so the total is exact and any page opens at once — they need only the
new footer and the rows choice:

| Table | What bounds it |
|---|---|
| Sites list | The company's websites, at most 200 (`MAX_HOLDS`, `convex/siteAccess.ts`) |
| Mentions, Share of voice | The site's questions, at most 1,000 (`MAX_LIST`) |
| Fan-out queries | The 1,000 most repeated (`MAX_SHOWN`, `convex/siteAi.ts`) |
| Sources cited | Pages cited in answers to the first 100 questions (`QUESTIONS_FOR_CITED_PAGES`) |
| Your searches, Who ranks above you, Search features | Tracked searches, at most 1,000 (`MAX_LIST`) |
| Questions people ask | The first 2,000 questions found (`MAX_PROMPTS`, `convex/siteGoogleSerp.ts`; since the build `QUESTIONS_KEPT`, 12,000 — §9) |
| Side by side, Compared with rivals | The site's competitors, from the company's websites (at most 200) |
| Organic competitors, Market map, Suggested competitors | At most 300 (`MAX_DISCOVERED`, `convex/siteCompetitors.ts`) |
| Site structure | At most 300 folders (`MAX_SECTIONS`) |
| Site audit, Link quality, Where links come from | One stored summary each |
| A problem's pages (audit) | The first 1,000 crawled pages (`PAGES_READ`, `convex/siteCrawlDetail.ts`) |
| New and lost links, Position bands, New and lost keywords | Day rows, at most about two years |

**14 lists paged on the server**, through `useSitePagedTable`
(`src/app/(dashboard)/app/sites/_components/useSitePagedTable.ts`), which
walks Convex's cursor pages. The server never counts them, so the footer only
knows the pages already opened ("Page 1 of 2" grows as you go), and opening
page 31 fetches pages 1 to 30 first:

| Table | Query | How big it gets |
|---|---|---|
| All keywords | `siteKeywords.listKeywords` | Grows past the site's keyword limit — §3.3 |
| A page's keywords | `siteKeywords.listKeywords` (one page) | As All keywords |
| Wins and losses | `siteKeywords.listMoves` | As All keywords; lost searches are kept for good |
| A feature's keywords | `siteRecords.featureKeywords` | The newest full keyword list, at most 10,000 |
| A competitor's shared searches | `siteRecords.sharedSearches` | The competitor's keywords |
| Top pages | `siteKeywords.listPages` | The site's pages with a ranking search |
| Content gap | `siteCompetitors.listContentGap` | Up to 25 rivals × 5,000 keywords each (`convex/siteContentGap.ts`) |
| All backlinks | `siteLinkLists.listBacklinks` | 1,000 one-per-website; every link up to the site's backlink limit (10,000 at most) |
| Referring domains, Anchors, Referring IPs | `siteLinkLists.list*` | 1,000 each (one request of 1,000) |
| Broken backlinks | `siteLinkLists.listBrokenBacklinks` | Within the 1,000 one-per-website links |
| Paid keywords | `sitePaid.listPaidKeywords` | 100 (the everyday call's limit) |
| Full answers | `siteAnswers.listAnswers` | One question at a time, one row per engine per day it was asked; grows daily |

### 3.2 Database limits that shape this

From Convex's own limits page (docs.convex.dev/production/state/limits, read
2026-09-25). Per request: at most **16 MiB read**, **32,000 records
scanned**, **4,096 separate reads**, and **1 second** of work. One record: at
most **1 MiB**, and **8,192** items in any list inside it. The search index
returns at most **1,024** results. The repo also allows one `.paginate()` per
function (`scripts/check-convex-pagination.mjs`). The speed target is the Sites
plan's own: every table's first page in under a second on a site with 50,000
keywords (D15, `convex/sitesLoad.test.ts`).

### 3.3 Found while planning — these affect the totals

- **All keywords keeps searches from older checks.** It holds one row per
  search the site has ever been seen ranking for (`siteKeywordRanks`,
  `convex/siteSchema.ts`). A list held to a limit below the site's real total
  never counts as complete (`listDayComplete`, `convex/siteSummaries.ts`), so a
  search that drops out of the top N is never marked lost and keeps its last
  position. Lost searches are kept for good. An exact total of today's list
  would count all of these (T9).
- **Wins and losses disagree with their own numbers.** The menu counts only
  the moves at the newest check (`convex/siteSummaries.ts`, "What moved at the
  last check"); the list shows every row whose last status is that move, from
  any check (`listMoves`) (T10).
- **Search cannot be sorted or fully counted.** The big lists search through
  Convex's search index (docs.convex.dev/search/text-search, read
  2026-09-25). The last word typed matches the start of a word ("rod" finds
  "rods"); earlier words must match whole. Results come best match first
  only — a search cannot be sorted by position or volume — and it stops at
  1,024 matches, so a search on a big list has no exact total past that (T8).
- **Some stored counts lag.** A keyword's intent is written onto its row as it
  is judged (`patchKeywordIntent`, called from `convex/seoCollectionParse.ts`),
  outside the rebuild that writes the stored counts, so a count by intent can
  trail the rows.
- **Lists land in parts.** A list of every keyword or every link arrives in
  1,000-row requests that can land hours apart (`convex/sitePagedLists.ts`), so
  it is partly new and partly old in between.

### 3.4 Lists with a quiet ceiling (T11)

Four of the 22 small lists stop at a limit without saying so:

- **Questions people ask** keeps the first 2,000 questions it finds.
- **Sources cited** reads only the first 100 of the site's questions (it can
  have 1,000).
- **A problem's pages** reads the first 1,000 crawled pages. The standard
  crawl is 1,000 pages, but a larger one would be cut short.
- **Fan-out queries** shows the 1,000 most repeated, and does not say so.

With a numbered footer these would show a last page that looks like the whole
list, which is exactly the catch T6 rules out.

## 4. Options considered for the big lists

| Option | Why not, or why |
|---|---|
| Keep walking Convex's cursor pages (today) | No total, and a far page means fetching every page before it. |
| Read the whole list on every request | Fine for a list that can never pass 1,000 rows (§5.1). At 50,000 rows it runs into the 16 MiB and 32,000-record limits. |
| Convex's counting component (`@convex-dev/aggregate`) | Keeps running counts and can open page N, but for one sort order only, with no search and no filters combined: every combination would need its own copy. Not installed. |
| A separate analytics database, as Ahrefs runs | The most scalable, but a second database to run, fill and pay for. Not needed at these sizes; revisit if a list must pass 50,000 rows. |
| **A compact copy of each big list** | **Chosen (T7).** Exact totals and any page at once, with any search, filters and sort. §5. |

## 5. The design

### 5.1 Three kinds of list

1. **The 22 small lists already sent whole** (§3.1): the new footer and the
   rows choice. Nothing changes on the server, apart from T11.
2. **Server lists read whole** — Referring domains, Anchors, Referring IPs,
   Broken backlinks, Paid keywords and the one-link-per-website view of All
   backlinks (each at most a request of 1,000, read up to 2,500 to allow for
   last week's rows while this week's are filed), and a feature's keywords
   (a share of one keyword list, read up to 15,000 small rows): the server
   reads the whole list on each request, applies the search, filters and
   sort, counts, and returns one page.
3. **The big lists** — All keywords, a page's keywords, Wins and losses, a
   competitor's shared searches, Top pages, Content gap and every link on All
   backlinks: a compact copy each (T7). Full answers counts from a light index
   of the answers instead (§5.2), because an answer can be 60,000 characters.

### 5.2 The compact copy (T7)

**In plain words.** Beside each big list, the server keeps a slim copy of the
whole of it: one line per row, holding only what can be searched, filtered or
sorted on (a keyword's text, position, volume, traffic, intent and so on).
Asked for page 31 of All keywords with "Buying" ticked and "rod" in the search
box, the server reads the slim copy — a few records rather than 10,000 —
applies the search, filters and sort, counts what matches, takes rows 751–775,
and fetches the full details of just those 25. One request: the exact total,
any page, any mix of filters.

**The copies.** Five kinds, one per source of rows:

| Copy | Kept per | Serves |
|---|---|---|
| Keywords | Website and place | All keywords, a page's keywords, Wins and losses, and both sides of a competitor's shared searches |
| Pages | Website and place | Top pages |
| Every link | Website | All backlinks (every link) |
| Content gap | Company's hold of a website | Content gap |

**Full answers** is not a copy: one light row per stored answer
(`aiAnswerIndex`: its question, engine, place and day) is written beside each
answer's text and removed with it, and the list counts and pages from those.
Only the answers on screen are read in full. A search goes through Convex's
search index on the longest word typed, checks the best 50 matches per engine,
keeps those every word starts a word in, and says the full list is longer
when a search may have found more.

**How it is kept.**

- **Chunked to fit.** Each copy is a few records of JSON, each part up to
  about 700 KB — under a record's 1 MiB (§3.2). Each row carries its record's
  id, so the rows on screen are read in full by id, the cheapest read there is.
- **Swapped in whole.** A new copy is written beside the old one, then one
  small record is switched to point at it, and the old one is deleted. A
  reader always sees one complete copy, never half of two.
- **Rebuilt when its rows change.** The keyword copy is written by the site
  rebuild that already runs once a check is filed (`convex/siteSummaries.ts`),
  which then asks for Top pages' copy. A judged intent asks for a rebuild of
  each site and content gap it changed; judged page types ask for Top pages';
  each filed page of every-link backlinks asks for that copy; each content-gap
  rebuild ends by asking for its copy. Requests are claimed once and run
  shortly, one build of a list at a time (`beginRebuild`).
- **Checked.** A daily sweep (`sites-list-copy-refresh`) rebuilds any copy
  not rebuilt in the last day, so a missed request is put right within a day.
  A copy missing, or written in an older layout, answers "preparing": the
  table shows its loading row and asks for it once (`ensureSiteListCopy`). A
  build asked for before its website was deleted removes the copy instead of
  writing one, and a website's purge removes its copies.

**What it costs — the two trade-offs.**

- **More reading per page change.** Each page change reads the whole slim
  copy, not just 25 rows: roughly 1–1.5 MB for a 10,000-row list and about
  6 MB at the 50,000-row target (estimates, to be measured). At Convex's
  listed $0.22 per GB, a 10,000-row list costs roughly 20–30 cents per
  thousand page changes. Identical requests are answered from Convex's cache.
- **A short delay after data changes.** When a list changes, its copy is
  rebuilt in the background, usually within a minute of the change being
  filed; until then the table shows the previous complete copy.

**The ceiling.** Comfortable to 50,000 rows per list, the Sites plan's own
speed target and five times today's largest limit. Content gap can in theory
reach 125,000 (25 rivals × 5,000 keywords), so its copy keeps the 50,000
most-searched and the screen names that ceiling, as it already names its
per-rival one.

### 5.3 One request per table

Each list in kinds 2 and 3 gets one query: the site, its search, filters and
sort, the page and the rows (T2) in; that page's rows, the exact total and the
page count out. It reads the copy (or, for kind 2, the list) and then at most
100 records for the rows' full details, well inside 4,096 reads. On the page,
`useSiteListPage` asks for it and keeps the rows on screen while the next
page of the same list is on its way; `useSitePager` pages a list sent whole.

## 6. The work, in order

Each big table keeps today's footer until its own step lands, so no table goes
live with a half-working footer.

| Phase | What | Share of the work | Done when |
|---|---|---|---|
| 1 | The footer (§2) and the rows choice, on the 22 small lists | 15% | Every small list shows numbered pages, opens at 25, remembers its rows per page |
| 2 | The five server lists that stay under 1,000 rows (§5.1, kind 2) | 10% | Exact totals and any page, same rows as today for every filter and sort |
| 3 | T8, T9, T10 — word-start search, what All keywords counts, Wins and losses | 15% | The lists hold what their numbers say |
| 4 | The five compact copies, their queries, and the nine big tables (T7) | 50% | Exact totals and any page on every big list, proven at 50,000 rows |
| 5 | The four quiet ceilings (T11) | 10% | No list stops short without saying so |

Every decision is made. Each phase starts on Anthony's go (`AGENTS.md`,
"User Alignment And Approval"), and phase 3 comes before phase 4 because the
keyword copy holds what T9 says All keywords counts.

## 7. How it is proven

- **The footer**: which numbers show and where "…" goes, first and last page,
  one page, empty, loading; the rows choice, remembered per page, in the
  address, keeping your place when it changes.
- **Same rows as today**: for every table, every filter and sort returns the
  rows today's query returns, in the same order — apart from the changes T8,
  T9 and T10 agree.
- **Exact totals** under every filter and search.
- **The copies**: rebuilt by each change that should rebuild them; swapped
  whole; every record under 1 MiB and 8,192 items; the background check
  catches a copy out of step.
- **Speed**: the local speed test (`convex/sitesLoad.test.ts`, run here and
  not on GitHub) opens page 1, a middle page and the last page, filtered and
  not, on 50,000 keywords and 20,000 links, within the Sites plan's targets.
- **Admin untouched**: the other screens' footers render as before.
- **The usual gate** (`AGENTS.md`): `npm run verify:env`, `npm run lint:all`,
  `npm run check`, `npm run build`, `git diff --check`, and a look at the
  screens on the running dev server.

## 8. What this changes in the Sites plan

With T7 agreed, D15's "Counts and totals are stored, not counted" in
[the Sites plan](user-sites-plan.md) changes to: *totals come from the compact
copy, counted there — a few records, never the rows — so a filtered total is
exact and "more than N" is no longer needed.* Its page size of fifteen gives
way to T2 and T3. Each table works as D15 describes until its own phase moves
it over.

## 9. What was built (2026-09-25)

**Phase 1 — the footer.** `PaginationFooter` in the screen kit gained a
numbered variant and a rows choice that only the Sites tables switch on
(`numbered`, `rowsChoice`); every other screen is unchanged.
`useSiteTablePaging` keeps the page (`p`) and rows (`rows`) in the address
and remembers the rows per page in the browser (`hakken.sites.rows.<page>`,
`siteTableRows.ts`); changing the rows keeps the first row on screen. The 22
small tables page through `useSitePager`.

**Phase 2 — lists read whole.** `convex/siteListPages.ts` cuts one exact page
from a list (`pageOfList`), keeps one row per key while a new list is filed
over the last (`newestPerKey`) and says where a list was held to a limit
(`heldTo`). Referring domains, Anchors, Referring IPs, Broken backlinks and
Paid keywords read their whole list.

**Phases 3–4 — the big lists.** `siteListCopies.ts` (storage, requests, the
daily sweep), `siteListCopyBuilders.ts` (Top pages, every link, content gap,
and `ensureSiteListCopy`) and `siteKeywordCopy.ts` (the keyword copy, written
by the site rebuild). T8, word starts, lives in `convex/utils/wordStarts.ts`
and every Sites search uses it: each word typed must start a different word of
one of the row's texts ("c.com" finds c.com, not b.com). T9: the latest check
is the newest keyword list with no page still out, else the newest everyday
check (`latestKeywordCheck`); All keywords shows those it found, the site
rebuild counts only those (so the menu and Overview agree with the table), and
All keywords' status filter gained "Not in the latest check", with a Last seen
column. T10: Wins and losses lists the moves on the rebuild's ranking day,
the day the menu counts. Full answers counts from `aiAnswerIndex`; the
migration `2026-09-25-answer-index` indexes answers filed before it and must
run once on each deployment.

**Phase 5 — quiet ceilings.** Questions people ask now holds up to 12,000
(a dozen for each of a site's thousand searches); Sources cited, an audit
problem's pages and Fan-out queries say when a read stopped short. Every list
held to a limit reads "Showing 1-25 of N · the full list is longer" in its
footer.

**Also visible.** The Anchors chart draws the first 15 anchors of the page on
screen, as it drew a whole fifteen-row page before; its caption says so.

**The rule, kept.** `AGENTS.md` and `docs/developer/screen-kit.md` record the
Sites exception to fifteen rows; `src/pagination-drift.test.ts` fails a Sites
table that pages any other way.

**Measured.** The local speed test (`convex/sitesLoad.test.ts`, 50,000
keywords, 5,000 pages, 20,000 links, run with `SITES_LOAD_REPORT=1`): every
keyword table page — first, middle or last, filtered, sorted or searched, 25
or 100 rows — about 70 ms, 5% of a full scan of the keywords; Top pages about
230 ms, 18%; every link about 40 ms, 3%.

**Checked (2026-09-25).** `npm run lint:all`, `npm run check` (600 files,
5,244 tests, the two local-only timing tests among them), `npm run build` and
`git diff --check`, all clean. On dev, in the browser, against kordatackle.com's
real data: All keywords opens at 25 rows of 2,545 with pages 1–5 … 102; page
102 holds the last 20; 100 rows from there lands on page 26 of 26 (rows
2,501–2,545) and is remembered; "rig kor" finds 54 and starts again at page
one; Back from a keyword reopens page 3 at 50 rows. Top pages (529), All
backlinks (463 websites; 1,000 every link), Referring domains (463), Anchors
(791, with its caption), Content gap (6,160), Fan-out queries (52), Sources
cited (23), Full answers (8) and two audit problems (17 and 1, the audit's own
counts) all page with exact totals. A competitor with no copy yet
(anglingdirect.co.uk, 982 searches held of 28,575) showed its loading row and
filled in about ten seconds; its shared searches with kordatackle.com opened
at 55. No console errors. The migration `2026-09-25-answer-index` ran on dev
and indexed 84 answers.

Found and fixed while checking: the footer wrote "of 2545" where the page
writes "2,545". The Sites footers now write their numbers as the rest of the
page does (`useCountLabels`, `useSitePagedTable.ts`); the admin footer is
unchanged.

Noticed, not changed: Referring domains lists 463 websites, 369 still linking
and 94 lost, where the Overview's "Linking websites" is DataForSEO's own count
of those linking now (382). The exact total makes that difference visible for
the first time.

## Change log

- **2026-09-25** — Planned. T1–T5 agreed with Anthony; T6–T11 proposed. The
  footer's look follows his Ahrefs screenshots of the same day.
- **2026-09-25** — T6–T11 agreed as recommended ("I will go with your
  recommendations for the best ux"). T8 was corrected before he agreed it: an
  earlier message said today's search misses "rods" for "rod", but Convex's
  search already matches the start of the last word typed. Its real limits are
  best-match order only and 1,024 matches, so the choice became word-start
  matching on every word rather than plain "contains".
- **2026-09-25** — Built, all five phases, on Anthony's "build it all please
  and double check it before handing it back to me" (§9). Three departures from
  the design above, each recorded in §5: a feature's keywords is read whole
  rather than from the keyword copy (it is a share of one list); Full answers
  counts from a light index of answers rather than a copy (an answer can be
  60,000 characters); and word-start search needs each word typed to start a
  different word of the same text, after "c.com" was found to match b.com.
- **2026-09-25** — Checked (§9): the full local gate and the build, and the
  tables in the browser on dev. One fix came of it: the footer's numbers are
  written as the page writes them. Two constants renamed so the broad-read
  guard, which resolves constants by name across files, reads the right size:
  `QUESTIONS_KEPT` (`siteGoogleSerp.ts`) and `FEATURE_LIST_READ`
  (`siteRecords.ts`).
