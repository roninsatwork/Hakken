# Sites — making the screens clearer and clickable

**Started 2026-09-24. Status: built 2026-09-24 — see §6; not committed.** Follows
[the Sites plan](user-sites-plan.md), which built the 35 screens. Change a
decision here, with a date, before building anything that disagrees with it.
Follow `AGENTS.md`.

Anthony, 2026-09-24, after a first good look at the Sites screens: "a lot of
them I just don't understand, the information is not clear; we have tables
with numbers on that are not clickable to see the detail of what makes up
those numbers. The tables are very wide and don't fit the app's standard
viewport of a 13 inch MacBook Pro. Basically lots of information but I'm
totally overwhelmed … and no idea what it all means." Later that day, after
Korda's first full run gave every screen real numbers: "do you want to revise
the screen to add in clickable table rows to see more detail? Perhaps perform
a screen audit first to see what's missing and how we can improve the UX".
And: "let's make a repo plan for the updates. Let's start with we need to
remove references to DataForSEO on the user frontend and rewrite them."

## 1. No supplier names on the client's screens

**Rule.** A client never reads the name of the company we buy data from, or of
another SEO tool: the numbers are presented as ours. Admin screens keep
DataForSEO's name, because they are about the supplier.

Sixteen lines of the client's wording name DataForSEO, all in the Sites
screens (`messages/en.json` and `messages/it.json`, under `sites.*`); one of
them also names Ahrefs. Nothing else on the client's side does: the other ten
messages naming DataForSEO are all under `admin.`, and the client's code and
the data it shows were searched, where only module names mention it. The
rewrites, in plain words:

| Message | Now | Rewrite |
|---|---|---|
| `sites.keywords.listing` | Listing {stored} of the {total} keywords DataForSEO found for this website. | Showing {stored} of the {total} searches this website ranks for — the ones that bring it the most visits. |
| `sites.keywords.kdHint` | Keyword difficulty from DataForSEO, 0 to 100 | How hard it is to reach page one for this search, from 0 (easy) to 100 (hardest) |
| `sites.keywords.cpcHint` | What a click costs as an advert, in US dollars (DataForSEO) | What advertisers pay for a click on this search, in US dollars |
| `sites.keywords.trafficHint` | Visits a month DataForSEO estimates this search brings the website | Estimated visits a month this search brings the website |
| `sites.pages.chartHint` | … the traffic DataForSEO estimates they bring. | How many of this website's pages rank for at least one search, and the visits they are estimated to bring. |
| `sites.pages.pageRankHint` | DataForSEO's page rank, 0 to 1,000 — its own scale, not Ahrefs' UR | How strong this page is, from the links pointing at it: 0 to 1,000 |
| `sites.organic.description` | Every website DataForSEO found ranking for the same searches, most overlap first. | Every website ranking for the same searches as this one, most overlap first. |
| `sites.googleFeatures.acrossAllHint` | DataForSEO's count, at the newest check: … | At the newest check: searches whose results page shows this website in the feature. |
| `sites.bands.description` | … DataForSEO's count across everything it ranks for, not only the keywords listed. | … Counted across everything it ranks for, not only the keywords listed. |
| `sites.newLost.description` | … DataForSEO's counts at each check, across everything it ranks for. | … counted at each check, across everything it ranks for. |
| `sites.marketMap.roles.FOUND` | Found by DataForSEO | Also ranking for your searches |
| `sites.linkQuality.description` | … DataForSEO's spam score, … | How clean this website's links are: a spam score, links that point at broken pages, and broken pages here that others link to. |
| `sites.backlinksDomains.rankHint` | DataForSEO's rank for this website's links to yours, 0 to 1,000 | How strong this website's links to yours are, from 0 to 1,000 |
| `sites.backlinksNewLost.description` | … from DataForSEO's weekly count. | Links and linking websites gained and lost in the dates chosen, counted each week. |
| `sites.audit.scoreScale` | of 100, from DataForSEO | of 100 |
| `sites.paid.description` | … DataForSEO's estimate, from the rankings we already collect. | Whether this website buys Google adverts, on how many searches, and what the visits would cost — estimated from the rankings we collect. |

The Italian lines are rewritten to match, in the same change.

**Keep it that way with a test.** A drift test (`AGENTS.md`, code quality
priority 1) fails when any client-side message — everything outside `admin.` —
names DataForSEO or another SEO tool (Ahrefs, Semrush, Moz, Majestic), so the
rule does not rely on memory.

## 2. The audit — what the screens do today

Every Sites screen opened for kordatackle.com on 2026-09-24, after Korda's
first full run, at the width of a 13-inch MacBook (1440px wide, which leaves a
table about 856px), and each screen's code read for what it shows and what it
could show. Measurements are in the table in §4.

**Findings:**

1. **Almost nothing can be clicked.** Of the 30 tables drawn for Korda, one
   opens anything — Site audit, whose rows open a modal of the pages behind
   each problem. On every other screen a number is a dead end; the four figure
   cards on the Overview are the only other links. The complaint quoted
   above, confirmed.
2. **Sixteen of the 31 tables are too wide for a 13-inch MacBook.** Each is
   set to a fixed minimum of 900 to 1,400px, so the reader scrolls sideways;
   four more are set to 860px, 4px over. Worst: All keywords and Top pages
   (12 columns, 1,400px — 544px too wide), Competitors side by side (1,250px),
   All backlinks (1,200px). (Full answers counts among the sixteen, though
   Korda's is empty and draws no table yet.)
3. **The screens do not say what they mean.** The rest of it: "no idea
   what it all means". Each screen shows its numbers but not the question
   they answer or what to do about them, and the long tables put every
   column on an equal footing, so nothing stands out.
4. **Twelve screens are empty for Korda**, for want of setup rather than data:
   all five AI answers screens (no questions set up) and all five Google
   results screens (no tracked searches) — and both Paid search screens,
   because Korda buys no adverts. Each says so in a line, but five empty
   screens in a row read as a broken product.
5. **First run only.** Several charts and the Calendar hold one day, and the
   Overview's cards say "Nothing to compare yet". This fixes itself with
   the next weekly run; nothing to build.
6. **Stored but never shown.** Data we pay for that no screen reads:
   - a keyword's competition, search intent, results count, DataForSEO's own
     previous position and movement, and the ranking page's strength and links;
   - the searches where the site appears in AI Overviews, map packs and
     featured snippets (`siteKeywordFeatures`) — the Search features figures
     count them, and nothing lists them;
   - each crawled page's speed, size, words, links, depth, redirect and
     canonical (`siteCrawlPages`);
   - each link's rel values, place on the page, kind of site, spam score, own
     rank, language and last sighting (`siteBacklinks`);
   - each competitor's search-by-search comparison, which Side by side works
     out and then throws away (`websiteSearchStats`), and the "named by AI"
     and "beats you on" figures, whose labels exist but are not drawn.
7. **Several drill-downs are already half built.** Queries exist that no
   screen uses this way: the keywords of one page (`listKeywords({page})`),
   position history for any keyword (`searchPositions`), one question's
   answers (`listAnswers`), the pages of one folder (`listPages({section})`),
   one network's servers (`listReferringIps({subnet})`). Many screens already
   accept a filter in their address (`?band=`, `?section=`, `?question=`,
   `?feature=`, `?network=`), so a number can open a filtered list with a
   link alone.

### Modals and pop-ups — checked again, 2026-09-24

After the decision in §3 (no modals in Sites), every piece of code the 35
Sites screens use was traced — the screens and every shared part they draw
on, 86 files — for anything that pops up over the page:

| What | Where | What happens |
|---|---|---|
| **A modal** | Site audit: clicking a problem in the table (`audit/ProblemPages.tsx`, on `HakkenModal`) | Opens a modal listing the pages with that problem. **The only modal in Sites; it becomes a screen.** |
| A small menu | Every chart's Download button (`ChartExportWrapper`) | Drops a short list of file formats under the button. Not a modal and opens no detail: it stays. |
| Hover labels | Every chart | Pointing at a chart shows the value at that point; nothing to click. Stays. |
| Text shown in place | Full answers' "Read more" | Opens the rest of the answer where it is, not in a modal. Stays. |
| App-wide menus | The header's profile menu and notifications | Part of every screen in the app, not of Sites; not changed here. |

No screen opens a modal from a figure, a card or a chart.

## 3. What to change — recommendation

**Decided 2026-09-24 — no modals in Sites; every click opens a screen.**
Anthony: "I don't want any modals that are clickable from the tables or
anywhere in this section. These are all new screens with a back button."
And: "This includes any screens that link to modals." So:

- A row, a figure or a card that shows more opens a **new screen**, never a
  modal, a panel or a pop-up.
- Each such screen is a record-level page and wears `DetailHeader` (screen
  kit, "Headers"): a quiet back row on its own line — "← Back to All
  keywords" — then the title, which is the thing itself (the keyword, the
  page, the linking website).
- **Back returns to the table as it was left**: the same filters, search,
  dates and page of the table. Filters, search and dates already live in the
  address; the table's page number does not yet (`useServerPagedTable` keeps
  it in memory, so today it would reset to page 1), and moves into the
  address once, for every Sites table. A screen opened from a bookmark or a
  shared link goes back to the list it belongs to.
- Each screen has its own address, which names what it shows, so it can be
  bookmarked, shared or opened in a new tab.
- The one modal there today, Site audit's list of pages behind a problem,
  becomes a screen the same way.

In the order to build them. Each is a proposal until Anthony agrees it.

1. **Supplier names off the client's screens** (§1). Small, and first.
2. **Every row opens its own screen.** Clicking a row opens a new screen for
   that one thing, with the story behind it — its history over time, the
   records that make it up, everything stored about it. One shared layout
   for these screens, built once, so each only says what goes on it. Start
   where the data is richest and the questions most common: **All keywords**
   (a keyword's screen) and **Top pages** (a page's screen), then
   **Backlinks**, then **Competitors**, then the rest, and Site audit's
   modal with them (§4 says what each screen holds).
3. **Every table fits a 13-inch screen.** At most about six columns: the ones
   a reader decides on (for All keywords: keyword, position, change, volume,
   visits, page). Everything else moves onto the row's own screen, which is
   where it is read anyway.
4. **Each screen says what it means.** The line under each title becomes the
   question the screen answers, in plain words ("Which searches bring this
   website visits?"), and the column that answers it comes first. Done
   screen by screen, with its columns and the screens its rows open, so each
   screen is reworked once.
5. **Every number opens the records behind it.** Figure cards, counts and
   chart totals link to the list they summarise — most through the address
   filters that already exist (finding 7); the Search features counts need
   one new query.
6. **An empty section says so once.** When a whole group has nothing yet —
   AI answers and Google results for Korda — its screens are replaced by one
   plain note of what it would show and what it needs ("add the questions
   your customers ask AI"), and the side menu marks the group "not set up"
   rather than offering five empty pages. Separately, Korda's AI questions
   and tracked Google searches are worth setting up, so these screens have
   something to show.
7. **Charts stay as they are** until a few weeks of data exist; judge them
   then.

## 4. Screen by screen

What a click would open — always a new screen with a back button, or a
list screen already filtered — and whether the data needs new work. "Existing" is a
query or filter that already exists; "new" needs a new query over data we
already store; "not stored" cannot be shown yet. Width is the table's need
against about 856px on a 13-inch screen.

| Screen | Today | A click opens a screen showing | Data |
|---|---|---|---|
| Overview | 4 cards link through; 2 charts | A chart day: what changed that day (as Calendar) | new |
| Calendar | Day cells, not clickable | A day: keywords that moved, answers, links gained | new |
| Site audit | Rows open a **modal** of the pages with the problem | A problem: the pages that have it (today's modal, as a screen). A page: its speed, size, links and all its problems. The severity cards: the problems filtered | existing (the modal's query) + new |
| AI mentions | 900px wide; empty for Korda | The question's answers from each engine | existing (`?question=&engine=`) |
| Share of voice | empty for Korda | Per question: how often each site was named; the answers naming it | new |
| Full answers | 900px wide; "Read more" opens in place | The answer: its full text, the sources it cites and the searches the engine ran for it | new |
| Sources cited | empty for Korda | The questions and answers citing the page; the page's keywords | new + existing |
| What the AI searched | 960px wide; empty for Korda | The days it was seen; the answers that ran it; our Google rank for it | new |
| Your searches | empty for Korda | Position history and the page ranking each day; the results page on any day | existing + new |
| Wins and losses | not clickable | The keyword's position history | existing |
| Who ranks above you | 900px wide; empty for Korda | The whole results page, all hundred | extend existing |
| Search features | 960px wide; figures not clickable | The searches behind "In AI Overviews: N", map packs, snippets | new (`siteKeywordFeatures`) |
| Questions people ask | empty for Korda | The search it came up on | link only |
| All keywords | 12 columns, 1,400px wide | Position history, the ranking page, intent, difficulty, competition, where it shows in AI Overviews | existing (`searchPositions`) + extend |
| Top pages | 12 columns, 1,400px wide | The keywords the page ranks for; links to it; its crawl facts; AI citations | existing (`listKeywords({page})`) + new |
| Position bands | fits | A band's keywords (newest day) | link only (`?band=`) |
| New and lost | fits | The keywords behind each count (newest check) | existing (`listMoves`) |
| Site structure | fits | The folder's pages | link only (`?section=`) |
| Paid summary | figures not clickable; empty for Korda | The paid keywords list | link only |
| Paid keywords | 1,000px wide; empty for Korda | The same search's ranking without adverts | new |
| Competitors side by side | 1,250px wide | Search-by-search: where they beat you and where you beat them; the rival's own screens | new (data exists) |
| Organic competitors | 1,100px wide | Their overlap over time | new |
| Content gap | 900px wide | The competitor's ranking page and history for that search | new |
| Market map | fits | The rival's own screens | link only |
| Suggested competitors | fits | Why suggested: the searches or answers behind it | new |
| Backlinks summary | figures not clickable | All backlinks, linking websites, broken links | link only |
| Compared with rivals | fits | The rival's backlinks screens | link only |
| Link quality | figures not clickable | The broken links; the broken pages; the nofollow links | existing + new |
| Where links come from | fits | The links in a group | new (counts differ: kept links only) |
| All backlinks | 1,200px wide | One link in full: rel, place on the page, kind of site, spam score, rank, language, sightings | extend existing |
| Referring domains | 1,100px wide | That website's links to this one | new (needs an index) |
| Anchors | 900px wide | The links using those words | search approximates; exact needs an index |
| Referring IPs | 900px wide | A network's servers; a server's linking websites | existing / not stored |
| Broken backlinks | 1,100px wide | The broken page here, from the crawl | new |
| New and lost links | fits | The links gained and lost in a step | new (indexes exist) |

**Reusable pieces:** `DetailHeader` and its `back` row for every new screen;
`DataTable`'s `onRowClick`, which the Sites list already uses to open a
website; `CompactList`; the position chart from Your searches; and the cells
in `_components/SiteCells.tsx`. The query behind Site audit's modal
(`audit/ProblemPages.tsx`) moves to its new screen, and `HakkenModal` leaves
Sites. The new screens share one layout under `app/sites/_components/`, not
one per screen.

## 5. Decisions

All taken 2026-09-24, when Anthony said "Ok let's build this please and
double check everything in Chrome":

1. The rewrites in §1 — built as written.
2. Detail opens as a new screen with a back button, never a modal (§3).
3. The columns each table keeps — chosen by the rule in §3 (the ones a reader
   decides on, about six, the rest on the row's own screen) and listed in §6.
   Any column can come back; say which.
4. Empty groups: one "not set up" note in place of the screen, and the menu
   marks it — the whole AI answers group, and the three Google results
   screens that need tracked searches (Wins and losses and Search features
   read every keyword, so they have something to show without them).
5. The order in §3.

## 6. What was built — 2026-09-24

**Step 1, supplier names.** The 16 lines rewritten in English and Italian as
§1 has them; `src/supplier-name-drift.test.ts` fails if any message outside
`admin.` names DataForSEO, Ahrefs, Semrush, Moz or Majestic.

**The way screens open.**
- Every record opens its own screen at its own address, under the menu page
  it belongs to, with a `DetailHeader` back row (`_components/siteRecordLinks.ts`).
  The link carries where it was clicked from (`back`), so Back returns to
  that page exactly as it was left; a bookmark goes back to the page it
  belongs to; a `back` that is not a Sites address is ignored.
- The table's page number now lives in the address (`p`), for every Sites
  table (`useSitePagedTable`, `useSitePagedRows`, `useSiteTablePage`); a
  filter, search or date change starts again at page one. Checked in Chrome:
  All keywords page 3 → a keyword → Back → page 3, same rows.
- A list opened from a figure or a count ("985" on Position bands) shows a
  back row above its header (`BackRow`, now shared by `DetailHeader`).
- The side menu keeps lit the page a record was opened from.
- The one modal (Site audit) is gone: `audit/ProblemPages.tsx` deleted.

**The new screens** (under `/app/sites/[siteId]/`):

| Screen | Address | Opened from | What it shows |
|---|---|---|---|
| A keyword | `keywords/keyword?keyword=` | All keywords, Top pages, a page, Wins and losses, Your searches, Who ranks above you, Questions people ask, Search features, Content gap, Paid keywords, What the AI searched, a feature, a competitor | Position and its move, searches a month, visits, cost per click; position over time; everything about the search; the page that ranks; where else it shows on Google; this site among its competitors on it; for a tracked search, its standing and Google's whole results page (top ten, "Show all") and what people also ask. A search the site does not rank for borrows the search's facts from a competitor. |
| A page | `keywords/pages/page?path=` | Top pages, a keyword, Site structure's pages, Sources cited, Broken backlinks, a Site audit problem, a link | Searches it ranks for (paged, each opening its screen), visits and value, linking websites; how it ranks; what the crawl found (answer, problems, speed, size, words, links, depth, redirect, canonical); AI answers linking to it; its strongest links. |
| A feature | `google/features/feature?feature=` | Search features' three figures | Every search where the site is in the AI Overview, the answer box or the map pack, with its ordinary ranking. |
| An answer | `ai/answers/answer?answer=` | Full answers | The answer word for word, its sources (this site's opening their page), how it treated the site, and what the engine searched for the question. |
| A competitor | `competitors/rival?rival=` | Side by side, Organic competitors and Market map (competitors the company tracks) | Their figures beside this site's, and every search both rank for: where they are ahead, where this site is, or all. |
| A linking website | `backlinks/domains/domain?domain=` | Referring domains, All backlinks, any link | Its strength, links, pages and spam score, and each of its links in full — subdomains included. |
| An anchor | `backlinks/anchors/anchor?anchor=` | Anchors | The words' figures and each link using them. |
| A Site audit problem | `audit/problem?check=` | Site audit | The pages with the problem, each opening its page's screen. |

**Tables fit a 13-inch screen.** Measured in Chrome with the content column
held at 856px: every Sites table now fits, none scrolls sideways. Columns
moved onto the row's own screen: All keywords (intent, trend, difficulty,
cost per click, features, last checked), Top pages (traffic value, top 3, top
keyword, page rank, AI engines, last checked), Side by side (top 3, rank, last
checked), Organic competitors (their visits from shared searches, their
keyword count, last checked), All backlinks (last seen, last checked),
Referring domains (pages, lost, last checked), Anchors (rank, last checked),
Referring IPs (rank, first seen, last checked), Broken backlinks (first seen,
last checked), Paid keywords (page, last checked), and "last checked" from
the rest — the day each list was checked is on the record's screen and in
every download.

**Every number opens the records behind it** where the records are kept:
the Overview's cards (as before); Backlinks' links, linking websites and
broken links; Link quality's broken links and nofollow websites; Paid's
figures; Site audit's errors, warnings and notices (narrowing the table);
Search features' three figures; Position bands' and New and lost keywords'
newest counts (only the newest check's keywords are kept one by one).

**Each screen says what it means:** the line under every title is now the
question it answers ("Which searches bring this website visits?"), in
English and Italian.

**Not built, on purpose:**
- Overview and Calendar day screens (§4's first two rows): with one day of
  data there is nothing to open. Judge after a few weekly runs, with the
  charts (§3, step 7).
- New and lost links' counts do not open lists: DataForSEO counts each week's
  gains and losses across every link it knows, which our kept list cannot
  match, and a list that disagrees with its number would mislead.
- Where links come from's groups, Suggested competitors, Referring IPs'
  servers, and competitors the company does not track: nothing more is kept
  about them than their row. A network opens its servers.

**Checked:** `npm run check:guards`, lint and the type check clean; the whole
test suite passes (5,088 tests), with new tests for the record queries
(`convex/siteRecords.test.ts` — tenancy, a competitor not beside the site,
an answer to another company's question), the links and way back
(`siteRecordLinks.test.tsx`, including a `back` off the app ignored) and the
menu (`SiteMenu.test.tsx`). Every screen above opened in Chrome for
kordatackle.com except an answer's: Korda has no AI questions yet, so that
screen is covered by its test only. `npm run build` was not run: the dev
server was in use.

## Progress

Overall: 95% built. Step 1 (wording): 100%. Steps 2–6: 100%, bar the
Overview and Calendar day screens, left for real weekly data. Step 7 (charts):
unchanged, as planned.

## Change log

- 2026-09-24 — Plan written: supplier names off the client's screens, and
  the audit of all 35 screens after Korda's first full run, with the
  recommendation.
- 2026-09-24 — Decided: no modals anywhere in Sites; every click opens a new
  screen with a back button, which returns to the table as it was left.
  Modals and pop-ups checked again across all 86 files the Sites screens use:
  one modal (Site audit), which becomes a screen.
- 2026-09-24 — Built (§6): supplier names off the client's screens; a screen
  for every record with a back button that returns to the table as it was
  left; every table fitting a 13-inch screen; figures opening their records;
  one "not set up" note for empty sections; every screen's line rewritten as
  the question it answers. Not committed.
