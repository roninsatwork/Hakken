# Sites — every table sorts the same way, by its headings

**Started 2026-09-26. Status: built 2026-09-26, all five phases, committed and pushed to dev — see §9.** Change a
decision here, with a date, before building anything that disagrees with it.
Follow `AGENTS.md`. Builds on
[the numbered table pages](sites-table-pages-plan.md) (every Sites table's
footer and exact totals) and on the Keywords page as rebuilt on 2026-09-26
([change log](sites-ux-updates-plan.md#change-log)), which is the model.

Anthony, 2026-09-26, after using the rebuilt Keywords page: "this is great i
love how the table works". Then: "we need to make all tables in the sites
section have the same sorting … I think it's really key we have consistency
across all reporting tables."

Anthony, on the plan: "ok let build this out please" — every decision as
recommended.

Progress: **built** (2026-09-26), committed and pushed to dev. Estimate was about
four and a half working days (§7).

## 1. Decisions

| # | Question | Recommendation | Status |
|---|---|---|---|
| S1 | Which columns sort | **Every number and every date; a list column by how many it holds** (engines citing a page, competitors ranking, websites above you); **Site audit's "How serious"**, worst first; and **the name column** — the first column, which names the row (keyword, website, page, anchor, question) — A to Z. Labels and pills (intent, status, kind, type) do not sort: they have filters. Yes/no columns, long text (an answer) and a column showing the same day on every row do not sort either. | Agreed, 2026-09-26 |
| S2 | Which way the first press goes | **The best first**, as on Keywords today: a Google position top first (1 before 10); a date newest first; a name A to Z; every other number largest first. The second press turns it round. **Blanks always last**, whichever way. | Agreed, 2026-09-26 |
| S3 | How a table opens and remembers | **Every table opens on one order, shown by that heading's arrow.** The order goes into the page address (`sort`, `dir`) only when it is changed, so a copied link and Back keep it; changing it goes back to page 1. It is not remembered between visits. **The six sort dropdowns go** (§3.2). | Agreed, 2026-09-26 |
| S4 | Your own website in a comparison table (Share of voice, Side by side, Compared with rivals) | **Sorted with the others, still marked "You"**, so you can see where you stand. Today it is always first. The other choice: keep it pinned at the top whatever the order. | Agreed, 2026-09-26 |
| S5 | Downloads | **The file comes in the order on screen.** What it holds does not change: the filtered list for the smaller tables, everything for "Download all". A "Download all" file longer than one file can hold (50,000 rows) is cut as today, then ordered. | Agreed, 2026-09-26 |
| S6 | Tables whose order today is not a column | **A competitor's shared searches** is ordered by the competitor's visits, which it does not show: add a **Their visits** column and open on it. **A feature's searches** is A to Z today: open on **Searches a month**, most first. The three comparison tables (S4) open on their main figure. | Agreed, 2026-09-26 |
| S7 | The day-by-day tables (Position bands, New and lost, Link quality, New and lost links) | **Sort too**, opening on the newest day first, as today. | Agreed, 2026-09-26 |
| S8 | The Keywords page, built on 2026-09-26 | **Gains** Keyword (A to Z), Change (biggest rise first) and Last seen (in the "Not in the latest check" view), under S1. | Agreed, 2026-09-26 |

## 2. The rule, in one sentence

**Every Sites table sorts by pressing its headings, the same way everywhere,
over the whole list** — never just the rows on screen.

On Referring domains, today a dropdown offers "Strongest first", "Most links
first" or "Newest first". After: the table opens on Rank, highest first, with the arrow on the
Rank heading. Pressing Links puts the websites with the most links first, over
all 1,000, and pressing it again puts the fewest first. Pressing Spam score, which
cannot be sorted today, puts the most suspicious first, and blanks go last
either way. The address reads `?sort=backlinks`, so the link can be shared
and Back returns to it.

## 3. Today (2026-09-26)

### 3.1 The tables

**36 tables**, one per screen, every one on the kit's `DataTable` and the
Sites pagers ([sites-table-pages-plan.md](sites-table-pages-plan.md)).

- **1 sorts by its headings:** Keywords, since 2026-09-26.
- **6 sort with a dropdown** (§3.2).
- **29 have one fixed order.** Two of those order their rows twice, once
  on the server and again in the browser (§6).

They load in two ways, and sorting follows how each loads:

| How it loads | Tables | Where the sort must happen |
|---|---|---|
| **Paged on the server** (`useSiteListPage`) | 14 tables on 13 queries | On the server, before the page is cut, so it covers the whole list |
| **Sent whole** (`useSitePager`) | 22 tables | In the browser, over the whole list it holds |

### 3.2 The six sort dropdowns

| Screen | Offers today | File |
|---|---|---|
| Top pages | Most keywords first, Most traffic first | `keywords/pages/page.tsx` |
| Paid keywords | Most visits first, Dearest first, Most searched first | `paid/keywords/page.tsx` |
| All backlinks | Strongest website first, Newest first | `backlinks/all/page.tsx` |
| Referring domains | Strongest first, Most links first, Newest first | `backlinks/domains/page.tsx` |
| Anchors | Most links first, Most websites first | `backlinks/anchors/page.tsx` |
| Referring IPs | Most links first, Most websites first | `backlinks/ips/page.tsx` |

Each only goes one way, and none offers every figure it shows. Spam score,
Best position and Advert position cannot be sorted anywhere today, nor CPC
on Paid keywords.

### 3.3 Every server list is read whole

A server list can only sort the whole list if it reads the whole list. Each
does today, because each stores less than it reads:

| List | Stored at most | Read at most |
|---|---|---|
| Keywords, a page's keywords, Wins and losses, a competitor's shared searches | The site's keyword list | All of it (compact copy) |
| Top pages, Content gap, All backlinks | The whole list | All of it (compact copy; the gap copy says so past its limit) |
| Referring domains, Anchors, Referring IPs, Broken backlinks, one link per website | 1,000 | 2,500 (`LINK_LIST_READ`) |
| Paid keywords | 100 | 1,100 (`sitePaid.ts`) |
| A feature's searches | 10,000 | 15,000 (`FEATURE_LIST_READ`) |
| Full answers, for one question | One row per engine per day asked | 5,000 (`ANSWERS_LISTED`) |

If a list ever outgrows its read, it moves onto a compact copy, as keywords
and backlinks did. It is never sorted in part. §8 pins this.

## 4. The design

### 4.1 One sorting rule, shared by the server and the browser

A new `convex/utils/sortOrder.ts` holds the comparison: numbers, dates and
names; either direction; blanks last; ties settled by the row's name so a list
never reshuffles between pages. It contains nothing that needs Convex, so the
browser imports it as it already imports the word search
(`convex/utils/wordStarts.ts`, used in 17 screens). `byNumber`,
`byNumberDesc` and `byTextDesc` move there from `convex/siteListPages.ts`.
One rule, so a list sorted on the server and one sorted in the browser can
never disagree about where the blanks go.

### 4.2 One hook for the order in the address

`useSiteSort` (`src/app/(dashboard)/app/sites/_components/useSiteSort.ts`)
takes the table's sortable columns, each with its first direction, and its
opening order. It returns the order to ask for and the `sort` that
`DataTable` draws. A heading pressed writes `sort` and `dir` in one go, keeps
them out of the address while they are the opening order, and goes back to
page 1 (`useSetSiteParams` does this already). An address with an order the
table does not offer, such as an old bookmark saying `?sort=newest`, opens on
the table's own order rather than failing. The Keywords page's hand-written
version moves onto it.

### 4.3 The table

Built on 2026-09-26: `DataTable`'s `sort` and each column's `sortable`, with
the arrow, `aria-sort` and the kit's `Button`
([screen-kit.md](../../developer/screen-kit.md), "Headings that sort"). No
change.

### 4.4 Lists sent whole

`useSitePager` gains the order: it sorts the list with the shared rule, then
cuts the page. The download beside the table is given the same sorted list.
The three hand-written orders in the browser go (§6).

### 4.5 Lists paged on the server

Each of the 13 queries takes `sort`, which is a column key, and `direction`.
It sorts with the shared rule before `pageOfList` cuts the page. Their old
sort names (`rank`, `newest`, `backlinks`, `domains`, `cost`, …) give way to
the column keys. With no order asked for, each opens on the table's own.

### 4.6 What a list must hold for every row

A column can only sort the whole list if every row has its value before the
page is cut. Four tables have a column that is only looked up for the rows on
screen:

- **Top pages, Best position and Linking websites.** They are read from each
  page's own record after the cut. Add them to the pages copy
  (`PAGE_COPY_FIELDS`, `convex/siteKeywords.ts`). A copy with the old fields
  reads as missing (`readListCopy`), so each site's copy rebuilds itself on
  its first visit: the loading row shows for a few seconds, once.
- **A feature's searches, "Ranking below it" and "Searches a month".** Today
  there are 25 separate lookups per page. Read the site's keyword copy once
  instead, which holds both for every search. That is also fewer reads.
- **Full answers, Sources.** The count lives with each answer's full text,
  and reading every answer's text to sort would pass what one request may
  read. **Sources does not sort**; Checked does.
- **Keywords, "On {day}".** This is fetched for the rows on screen only, by
  design ("compare with"). **It does not sort.**

### 4.7 Downloads (S5)

- **Built in the browser** (`ListDownload`): these are given the sorted
  list, so no other change is needed.
- **Built on the server** (`TableDownload`, `exportSiteTable` in
  `convex/siteExports.ts`): these take the same `sort` and `direction` and
  order the rows before writing the file.

### 4.8 The rule, enforced

A drift test beside the paging rule in `src/pagination-drift.test.ts` fails:

- a Sites `DataTable` with no `sort`;
- a sort dropdown on a Sites screen;
- a right-aligned figure column that is not `sortable`, unless it is named in
  the test with its reason. At first those are Full answers' Sources and
  Keywords' "On {day}".

`screen-kit.md` and `AGENTS.md` gain the rule, beside the one for paging.

## 5. Table by table

**Opens on** is the table's own order and its direction. **Sorts by** lists
the other columns that sort, with the first press in brackets:

- top: a Google position, best first
- new: newest first
- A–Z: names
- most: largest first
- worst: Site audit's scale

**Doesn't sort** is what S1 leaves out, and why. **Loads**: *server* is paged
on the server; *whole* is sent whole.

### Site

| Screen | Loads | Opens on | Sorts by | Doesn't sort | Changes |
|---|---|---|---|---|---|
| Sites (the list of websites) | whole | Website (A–Z), your own websites first: today's order. Your websites stay above your competitors in every order (corrected while building — §9) | Website (A–Z), AI mentions (most), Keywords, Top 3, Estimated traffic, To do (most), Last checked, Added (new) | Type (label, has a filter), What moved (two figures in one cell) | Headings |
| Site audit | whole | How serious (worst), then most pages: today's order | Problem (A–Z), Pages (most) | Last checked (the same day on every row) | Headings; the browser's own order goes |
| A problem's pages | whole | Broken links on it (most) where shown; otherwise Page (A–Z), today's order | Page (A–Z), Answered (most) | — | Headings |

### AI answers

| Screen | Loads | Opens on | Sorts by | Doesn't sort | Changes |
|---|---|---|---|---|---|
| Mentions | whole | Question (A–Z), engines in their usual order: today's order | Named, Recommended (most) | Engine, Latest answer (labels) | Headings |
| Share of voice | whole | All engines (most) | Website (A–Z), each engine (most) | — | Headings; your row sorted in (S4) |
| Full answers | server | Checked (new): today's order | — | Engine, This website (labels), Answer (long text), Sources (§4.6) | Headings |
| Sources cited | whole | Times cited (most): today's order | Page (A–Z), Engines citing it (most), Last cited (new) | — | Headings |
| Fan-out queries | whole | Times seen (most): today's order | Fan-out query (A–Z), Engines (most) | What they want (label, has a filter), Tracked (yes/no) | Headings |

### Google results

| Screen | Loads | Opens on | Sorts by | Doesn't sort | Changes |
|---|---|---|---|---|---|
| Your searches | whole | Position (top): today's order | Search (A–Z), Change (biggest rise first), Best (top), Last checked (new) | How it's doing (label, has a filter) | Headings; paused searches stay after the others in any order, as today |
| Wins and losses | server | Change: the biggest move first (rise under Wins, drop under Losses) — today's order. New and Lost, which have no move, open A to Z, as today (§9) | Keyword (A–Z), From → to (today's position, top) | Page (words), Last checked (the same day on every row) | Headings |
| Who ranks above you | whole | Your position (top): today's order, paused searches last in every order (corrected while building — §9) | Search (A–Z), Above you (how many, most), Competitors above (most) | — | Headings |
| Search features | whole | On the page (how many features, most): today's order | Search (A–Z) | In the AI Overview, In the map pack, Featured snippet (yes/no; there is a feature filter) | Headings |
| A feature's searches | server | Searches a month (most) — was A to Z (S6) | Search (A–Z), Place in the feature (top), Ranking below it (top) | Page (words) | Headings; one keyword-copy read (§4.6) |
| Questions people ask | whole | Came up on (how many searches, most): today's order | Question or search (A–Z) | Kind (label, has a filter) | Headings |

### Organic search

| Screen | Loads | Opens on | Sorts by | Doesn't sort | Changes |
|---|---|---|---|---|---|
| Keywords | server | Position (top): as built | Keyword (A–Z), Change (biggest rise first), Volume, CPC, Traffic (most), Last seen (new, in its view) | Page (words), On {day} (§4.6) | Keyword, Change and Last seen added (S8) |
| A page's keywords (on a page's screen) | server | Position (top): today's order | Keyword (A–Z), Change (biggest rise first), Volume, Traffic (most) | — | Headings |
| Top pages | server | Keywords (most): today's default | Page (A–Z), Traffic, Best position (top), Linking websites (most) | Type (label, has a filter) | Dropdown goes; two fields into the copy (§4.6) |
| Position bands | whole | Checked (new): today's order | Each band, Page one, All keywords (most) | — | Headings |
| New and lost | whole | Checked (new): today's order | New, Up, Down, Lost (most) | — | Headings |
| Site structure | whole | Keywords (most): today's order | Section (A–Z), Pages, Top 3, Traffic, Share of keywords (most) | — | Headings |

### Competitors

| Screen | Loads | Opens on | Sorts by | Doesn't sort | Changes |
|---|---|---|---|---|---|
| Side by side | whole | Estimated traffic (most) | Website (A–Z), Keywords, Linking websites, Above it on (most) | How they compare (words) | Headings; your row sorted in (S4) |
| Organic competitors | whole | Shared keywords (most): today's order | Website (A–Z), Average position (top), All their traffic (most) | Kind (label, has a filter), Tracked (yes/no) | Headings |
| Content gap | server | Volume (most): today's order | Keyword (A–Z), Who ranks (how many competitors, most), Best position (top) | What they want (label, has a filter) | Headings |
| Market map | whole | Estimated traffic (most): today's order | Website (A–Z), Keywords, Shared keywords (most) | Who, Kind (labels, have filters) | Headings; the browser's own order goes |
| Suggested competitors | whole | Why (its number, most: shared keywords, or times named by AI): today's order | Website (A–Z), Last checked (new) | — | Headings |
| A competitor's shared searches (on its screen) | server | **Their visits** (most): today's order, now shown (S6) | Search (A–Z), Their position, Your position (top), Places between you, Searches a month (most) | — | Headings; the new column |

### Backlinks

| Screen | Loads | Opens on | Sorts by | Doesn't sort | Changes |
|---|---|---|---|---|---|
| Compared with rivals | whole | Linking websites (most) | Website (A–Z), Domain rank, Backlinks (most) | — | Headings; your row sorted in (S4) |
| Link quality | whole | Last checked (new): today's order | Each measure (most) | — | Headings |
| Where links come from | whole | Links (most): today's order | Group (A–Z), Share (most) | Last checked (the same day on every row) | Headings |
| All backlinks | server | Domain rank (most): today's default | Linking page (A–Z), First seen (new) | Anchor and link (words), Type, Status (labels, have filters) | Dropdown goes |
| Referring domains | server | Rank (most): today's default | Website (A–Z), Links (most), Spam score (most), First seen (new) | Status (label, has a filter) | Dropdown goes; Spam score sorts for the first time |
| Anchors | server | Links (most): today's default | Anchor (A–Z), Linking websites (most), First seen (new) | Status (label) | Dropdown goes |
| Referring IPs | server | Links (most): today's default | Address (in number order: 9.x before 10.x), Linking websites (most) | Network (words, has a filter), Status (label) | Dropdown goes |
| Broken backlinks | server | Domain rank (most): today's order | Linking page (A–Z), Answer (most: server errors before 404s) | Broken page here, Anchor (words) | Headings |
| New and lost links | whole | Week of (new): today's order | New, Lost (most) | — | Headings |

### Paid search

| Screen | Loads | Opens on | Sorts by | Doesn't sort | Changes |
|---|---|---|---|---|---|
| Paid keywords | server | Visits (most): today's default | Search (A–Z), Advert position (top), Volume, CPC, Est. cost (most) | — | Dropdown goes |

**Not in this plan:**

- The Overview's cards and the short lists on a record's screen (a keyword's
  Google page, a page's backlinks). These are fixed top lists, each with a
  way through to the full table, which sorts.
- Every admin screen: the admin UI is untouched.

## 6. Found while planning

1. **Top pages would sort Best position and Linking websites wrongly**, over
   25 rows rather than the list, because both are looked up after the page is
   cut. §4.6 moves them into the copy.
2. **A feature's searches makes 25 lookups per page** for two columns the
   site's keyword copy already holds. §4.6 reads the copy once.
3. **A competitor's shared searches is ordered by a figure it does not show**
   (the competitor's visits). S6 shows it.
4. **Two tables are ordered twice**, once on the server and again in the
   browser: Site audit and Market map. Only the second order is seen. Each
   gets one declared opening order. (Who ranks above you, listed here at
   first, re-orders only its chart — §9.)
5. **Three "Last checked" columns show the same day on every row** (Site
   audit, Where links come from, Wins and losses). There is nothing to sort,
   so they do not sort.
6. **Full answers' Sources cannot sort the whole list** without reading every
   answer's full text (§4.6).

## 7. The work, in order

| Phase | What | Share | Days |
|---|---|---|---|
| 1 | Shared parts: `sortOrder.ts`, `useSiteSort`, sorting in `useSitePager`, downloads given the sorted list, Keywords moved onto them, tests | 15% | ½ |
| 2 | The 13 server queries: `sort` and `direction`, the shared rule, the two copy fields, the keyword-copy read for a feature's searches, sorted "Download all", tests | 35% | 1½ |
| 3 | The 36 screens: sortable columns, opening orders, the six dropdowns and three browser orders out, "Their visits", wording in English and Italian | 30% | 1½ |
| 4 | The drift test, `screen-kit.md`, `AGENTS.md`, plan records | 10% | ½ |
| 5 | Proof (§8) | 10% | ½ |

About **four to five working days**. No DataForSEO runs, no paid calls and
no data migration: the pages copy rebuilds itself (§4.6).

## 8. How it is proven

- **The rule:** blanks last both ways, ties by name, and numbers, dates, names
  and IP addresses each in their own order (`sortOrder.test.ts`).
- **The hook:**
  - the first press gives the column's own direction and the second turns it
    round;
  - the address stays short and goes back to page 1;
  - an old or edited address opens on the table's own order.
- **Every server query:**
  - each sortable column, both ways, over a list longer than one page;
  - the last page is the other end of the list, and blanks come last;
  - an order it does not offer is refused cleanly.
- **The speed test** (`convex/sitesLoad.test.ts`, the 50,000-keyword site):
  the reversed orders and the new ones, first page and last, under the
  one-second budget.
- **The screens:** one page test for each kind — a server list, a list sent
  whole, a day-by-day table, and a comparison table with your own row.
- **The drift test** (§4.8), failing on a table without headings that sort.
- **In Chrome:**
  - every screen on ronins.co.uk;
  - the big lists on kordatackle.com, the larger site;
  - a heading pressed twice on each, and a download opened.
- **The full local gate:** `verify:env`, `lint:all`, `check`, `build`,
  `git diff --check`.

## 9. What was built (2026-09-26)

All five phases, the same day; committed and pushed to dev the same day.

**The shared parts.** `convex/utils/sortOrder.ts` is the one rule — values
compared either way, blanks last, ties by name, IP addresses in number order
(`ipSortKey`) — imported by the server's lists and by the screens, as the word
search is. `byNumber`, `byNumberDesc` and `byTextDesc` moved there from
`convex/siteListPages.ts`, which gained `ListSorts`, `listOrder` and
`sortDirectionArg`. `useSiteSort`, `useSiteSortedList` and `dayTableSorts`
(`src/app/(dashboard)/app/sites/_components/useSiteSort.ts`) are the screens'
side. `TableDownload` passes the table's order; `exportSiteTable` carries each
line's sort value and orders the file before handing it back.

**The server lists.** All 13 queries take `sort` (a column key) and
`direction`, and sort with the shared rule before the page is cut:
`listKeywords` (also Keyword, Change, Last seen), `listMoves`, `listPages`,
`listContentGap`, `sharedSearches` (opens on the competitor's visits),
`featureKeywords` (opens on Searches a month, and now reads the site's keyword
copy once instead of 25 lookups a page), `listAnswers` (by day only),
`listBacklinks`, `listReferringDomains`, `listAnchors`, `listReferringIps`,
`listBrokenBacklinks` and `listPaidKeywords`. The pages copy holds each page's
best position and linking websites (`PAGE_COPY_FIELDS`); an older copy reads as
missing and rebuilds itself on the first visit.

**The screens.** All 36 Sites tables pass `sort` and mark their sortable
columns. The six sort dropdowns are gone, with their wording in English and
Italian. A competitor's shared searches gained **Their visits** ("Le loro
visite"). The two orders written by hand in the browser (Site audit, Market
map) are gone.

**Corrected while building** — the code said otherwise, and today's order was
kept, as the plan meant to:

- **The Sites list** was not in the order websites were added. It is the
  company's own websites first, then A to Z (`byHoldOrder`). It opens on
  Website A to Z with your own websites above your competitors in every order.
- **Who ranks above you** re-orders only its chart. Its table is ordered by
  your position, paused searches last, and still opens that way.
- **Wins and losses** has four views, not two. New and Lost have no move to
  measure (a new search's change is 0, a lost one has no position), and open A
  to Z as they always have.
- **The Wins and losses download** is the whole keyword list, not the moves
  on screen, so it keeps its own order.

**How it was checked.**

- **The rule:** blanks last both ways, ties by name, days, names and addresses
  (`convex/utils/sortOrder.test.ts`).
- **The hook:** the first and second press, the short address, page one, and
  a bookmark the table does not offer
  (`src/app/(dashboard)/app/sites/_components/useSiteSort.test.tsx`).
- **The server lists**, each sortable column both ways, blanks last, the last
  page as the list's other end, and an old dropdown value refused:
  - `convex/siteSorting.test.ts`: Wins and losses, Content gap, Paid keywords,
    Broken backlinks and one link per website;
  - `convex/siteLinks.test.ts`: Referring domains, Anchors, Referring IPs;
  - `convex/siteRecords.test.ts`: a competitor's shared searches;
  - `convex/siteListCopies.test.ts`: a feature's searches;
  - `convex/sites.test.ts`: Keywords and Top pages.
- **The speed test** on the 50,000-keyword site (`convex/sitesLoad.test.ts`):
  the reversed and new orders, first page and last. Keywords either way took
  about 70 ms, pages by best position about 236 ms and weakest links first
  about 39 ms, against a 1,259 ms scan.
- **The screens:** Keywords, a list sent whole (Sources cited, including the
  download asking for the order on screen), a day-by-day table (Position
  bands), and a comparison table with this site sorted in (Compared with
  rivals).
- **The drift test** in `src/pagination-drift.test.ts`, seen to fail when a
  figure column stopped sorting.

## Change log

- **2026-09-26** — Plan written after a read of all 36 Sites tables, the 13
  server queries behind them and the six sort dropdowns.
- **2026-09-26** — Approved as recommended ("ok let build this out please");
  building.
- **2026-09-26** — Built, all five phases (§9). Three opening orders
  corrected to what the code showed today's to be: the Sites list, Who ranks
  above you, and Wins and losses' New and Lost views.
