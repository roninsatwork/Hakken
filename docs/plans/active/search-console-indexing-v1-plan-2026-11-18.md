# Search Console — Indexing, V1 (18 November 2026)

Anthony picked V1 on the canvas https://claude.ai/artifact/QLkRn4jwQ6xnDrJFw9RK3P ("i think this is good"), after
showing Google's own Page indexing screens for More Handles and Ronins and asking for "something similar FOR HAKKEN".
He then asked for a page behind each reason with "whats relevant" in its boxes, for Google's own words ("accepted as
industry standard"), for the screen to be generic ("we are building a generic platform"), and for Indexing to "work
from issues, not what is day to day normal". The boards are saved in
`docs/plans/assets/search-console-indexing-v1/`. This is what gets built, from parts already on the redone pages, and
nothing else. Nothing is built until Anthony says go.

## What the pages show, top to bottom

### Indexing (the summary)

1. **Title and line.** "Indexing". "Which of your pages are in Google, and why some aren't."
2. **Four boxes**, worked out from whichever reasons a website has:
   - **Not indexed**, with how many reasons Google gave.
   - **Indexed**, a count only. Indexed pages live on Pages, so this screen doesn't list them.
   - **The biggest reason**, its label in Google's words, with its pages out of all not indexed.
   - **Clicks on pages not indexed**, against all the website's clicks for the dates chosen.
3. **One line on progress**: how many of the website's pages are checked so far, and the day the rest will be done.
   Then **Full report in Search Console**, a link to Google's own Page indexing report, as Google gives apps no totals.
4. **When Google last visited your pages**: the shared `DaysChart`, with a tick box (`ticks`) for each reason the
   website has. Short names in the key (Unknown, Redirect, 404, Noindex…). Google's full words in the menu.
5. **Why pages aren't indexed**: the lean table. Reason (Google's words, the plain line on hover), Source, Pages,
   Clicks, Shown, Crawled. Biggest first. Each row opens that reason's page.

### A reason's own page (one screen for every reason)

1. **`DetailHeader`**: back to Indexing, the reason in Google's words as the title, one plain line under it.
2. **Four boxes, chosen by the kind of reason**, all worked out from Google's answer for each page:
   - **Errors** (5xx, redirect error, soft 404, 401, 403, 404, other 4xx): Pages, Last shown, Clicks they still got,
     In your sitemap.
   - **Kept out** (noindex, robots.txt, page removal tool): Pages, In your sitemap, Clicks, Last visited.
   - **Duplicates and redirects** (alternate page, page with redirect, both duplicate reasons): Pages, Google picked
     another page, Go to a page in Google, Clicks.
   - **Google chose not to** (Crawled and Discovered, currently not indexed): Pages, In your sitemap, Linked from your
     pages, Last visited.
   - **URL is unknown to Google**: Pages, Still shown this month, Clicks, Codes on the end.
3. **Impressions each day** for those pages: the shared `DaysChart`, with Show (Impressions, Clicks).
4. **Examples**: the lean table. Page, then the columns that fit the kind (Goes to, Last crawled, Last shown, Days),
   Clicks, Shown.
5. **When a reason has no pages yet**, its page says so in one line, as "Crawled - currently not indexed" does on the
   board for More Handles.

## The reasons

One list in code (`convex/utils/indexingReasons.ts`), each with Google's exact words, its Source, its kind and its
plain line. The words go in `messages/en.json` and `it.json`. Google's term only names a thing. Every sentence around
it is in everyday words (`docs/developer/writing-guide.md`, "Google's own terms stay").

- **Website**: Server error (5xx); Redirect error; Blocked by robots.txt; Excluded by 'noindex' tag; Soft 404; Blocked
  due to unauthorized request (401); Not found (404); Blocked due to access forbidden (403); Blocked due to other 4xx
  issue; Blocked by page removal tool; Alternate page with proper canonical tag; Page with redirect; Duplicate without
  user-selected canonical.
- **Google systems**: Duplicate, Google chose different canonical than user; Crawled - currently not indexed;
  Discovered - currently not indexed; URL is unknown to Google (only a page check gives this one).
- A reason Google adds later shows in its own words, with no Source, until it joins the list.

## Reads, and the new collector

Google gives apps no Page indexing totals. Its API answers about one page at a time (URL inspection), 2,000 a day for
each website and 600 a minute. So Search Console's collector gains **page checks**:

- **Which pages.** Every page of the website the app already knows (`holdPages`): the pages Google shows in Search
  Console, the sitemap and the app's own crawl. Pages Google never shows matter most for Crawled and Discovered, so
  the sitemap and the crawl are in from the start.
- **In what order.** Pages never checked, most clicks first. Then sitemap and crawl pages never shown. Then the
  oldest check.
- **How many.** Up to 1,600 a day for each website, keeping a fifth of Google's 2,000 in hand, 4 at once. A small
  website is checked in full on the first day (Ronins, 167 pages). A big one is checked in turn (More Handles' 21,715
  shown pages take about two weeks for the first pass).
- **What happens on a refusal.** The day's run stops, and starts again when the allowance comes back. No retry loop.
  The run hands itself on in steps, as the DataForSEO Collector does, and only a broken sign-in stops it, saying so.
- **What is kept.** One row a page, replaced at each check (`pageIndexChecks`): reason, verdict, last crawled,
  Google's and the website's chosen page, in the sitemap, linked from pages, checked at. And one small row a day for
  each website with the count for each reason (`pageIndexDays`), for a trend later.
- **The figures on the pages.** Clicks, impressions and last shown come from Search Console's saved page lists, as
  Pages reads them.

## Limits, said on the page or in this plan

- 1,600 page checks a day for each website, as above. The progress line says how far it has got.
- No Validation column, as Google doesn't share it.
- No Trend column until a week of daily counts is kept. It's added then, from `pageIndexDays`.
- Google's own totals (More Handles: 103,157 indexed, 1.36 million not indexed) count addresses nobody visits. The
  screen counts the pages it has checked and links to Google's report for the rest.

## The eye

Indexing's own findings rules (`convex/utils/sees/own/searchConsole.ts`), problems only:

- the biggest reason, and its share of the pages not indexed;
- the clicks on pages not indexed, against all clicks;
- pages in the sitemap that Google won't show (kept out, or chose not to);
- pages that still get clicks but aren't indexed, biggest first;
- a reason that grew since the last week's counts, once a week is kept.

Held on every period the date menu offers, on More Handles' checks from 18 November, in a new fixture. One real press
after building, with its cost said first, on Anthony's OK.

## Also changed by this piece

- **Today's Indexing page goes**, with its money-page table. Its faults: it says 0 of 4 main pages are indexed, because
  the weekly check asks without the www, and it never checks category pages.
- **The weekly money-page check** (`convex/moneyPageChecks.ts`, started by the Insights team) keeps its speed and
  structured-data checks. Its address fault (no www) is fixed so it asks the address the website really uses. Insights
  is left alone otherwise while the core data is fixed.

## Not in this piece

- Reading Google's totals. There's no way in.
- Moving Insights to read indexing from these checks, as AGENTS.md wants Insights to read sections' data. It's a piece
  of its own.
- The other two screens drawn today, Demand by service and Countries and devices. They wait on their own picks.

## Checks

- Tests: the reason list (every reason has words, Source, kind and plain line), the page order, the daily limit and the
  stop on a refusal, the boxes for each kind, a reason with no pages, the eye's rules on every period.
- Google's quota respected in every test run: the tests use the pretend Google, never the real one.
- English and Italian kept in step; `check:reading` and `check:words`; the table rule.
- A look test's saved outline for the summary and for a reason's page.
- Every read loads on every period on dev (`npx convex run … --identity`) for More Handles and Ronins. Then checked in
  Anthony's Chrome at 3,200 and 1,330 wide.
- GitHub's steps run here before any push. Built on `dev`, and not committed until Anthony asks.

## Size

About six developer days. Most of it is the collector (two and a half days) and the eye (one and a half).

## Built — 18 November 2026

Built on `dev` on Anthony's "Yes, build all three", from the boards and this plan. Not committed. No page check has
asked Google: they're switched off on dev until Anthony's OK (below).

### What was built, and where

- **The reasons** (`convex/utils/indexingReasons.ts`): the 17 in Google's exact words, each with its Source, kind, address
  and English plain line; a reason Google adds later keeps its own words, no Source, and Google's-choice boxes. The words
  in English and Italian (`searchConsole.indexing.reasons`), Google's Italian terms for Italian.
- **The page checks** (`convex/searchConsolePageChecks.ts`, plain parts in `convex/utils/pageIndexChecks.ts`): pages from
  `holdPages`, never checked and shown first by most clicks, then never shown, then the oldest check before today. Up to
  1,600 asks in Google's own day (Pacific time, when its allowance comes back), four at once, saved every batch, a watched
  chain (`SC_CHECKS`, `collectionSteps.ts`) handing on every 400 pages or 4 minutes. Google's allowance used up stops the
  day; a sign-in that's no good stops it too; a page Google fails on keeps its last answer and waits its turn; a whole
  round of four failing stops the day. Started after each website's nightly run (`afterDays`), with a line on the run.
  The address asked is the one most of the pages Google showed lately were on (`usedOrigin`: the www twin), or a
  web-address property's own.
- **The two tables** (`convex/pageIndexSchema.ts`): `pageIndexChecks`, a row a page, replaced at each check;
  `pageIndexDays`, a row a day with each reason's pages, kept up as checks are saved, 90 days kept. Cleared with a
  website's Search Console figures. The pretend Google answers page checks too (`utils/rehearsalGoogle.ts`).
- **The reads** (`convex/searchConsoleIndexing.ts`): the summary and a reason's page from the checks; their clicks from
  the main home country's kept pages (`countryPage`) or a kept country's page list, else one Search Analytics ask
  (`searchConsoleLiveIndexing`); a reason's days, last shown and days shown from the days of pages kept
  (`searchConsoleIndexingDays`, no Google ask).
- **The pages**: the summary (`[siteId]/indexing/page.tsx`) and one page for every reason (`[siteId]/indexing/[reason]`),
  as the boards draw them, the parts in `_components/IndexingParts.tsx` and `_components/indexingSees.ts`. Today's page
  and its money-page table are gone; `siteMoneyPages` stays for Visibility's audit.
- **The weekly money-page check** asks the address the website really uses (`checkTargets`, `usedOrigin`).
- **The eye**: Indexing's own rules and a reason page's (`convex/utils/sees/own/searchConsoleIndexing.ts`), both screen
  entries, the fixed lines, three measures. Indexing left the eye's to-do list (26 to 25).
- **Ask Hakken**: `read_search_console` gains `indexing`, read through the screens' own reads (`askIndexing`): the summary,
  or with `key` one reason's boxes and pages, each reason with its plain line.

### What changed from the plan, and why

- **Codes on the end will read 0 on real checks.** `holdPages` keeps each page once, without codes, so the checks ask no
  link with a `?`. More Handles' 180 links with `?idp=` codes are in the fixture only.
- **The checks are off until switched on** (`SEARCH_CONSOLE_PAGE_CHECKS`: `on`, or hold ids), so nothing asks Google on
  dev before Anthony's OK. The empty page says so, or "tonight" once on.
- **A reason's chart, Last shown and Days** come from the days of pages kept (about 60, every country's), not the date
  menu. The hint says the first day kept.
- **The Pages box** says "Out of the N pages checked so far", as checks span days.
- **A reason's page has an eye of its own** (`searchConsole.indexingReason`).
- **Limits**, all in code: 20,000 pages with a reason read at most; the 10 pages not in Google with most clicks read, 3
  named by the eye; 25 of a reason's pages for Ask Hakken.

### Not done, or waiting

- **The first real run**, on Anthony's OK: `npx convex env set SEARCH_CONSOLE_PAGE_CHECKS gs7s64z25gddkrkcarvpfjxw7x8fqkwn`
  (More Handles alone; `on` for every website), then `npx convex run searchConsolePageChecks:startPageChecks
  '{"siteId":"gs7s64z25gddkrkcarvpfjxw7x8fqkwn"}'`. It uses 1,600 of More Handles' 2,000 page checks a day for about 14
  days; Ronins' 167 pages take one day. Google charges nothing.
- **One real press of the eye**, on Anthony's OK.
- **The Trend column**, once a week of daily counts is kept.
- **Checked in Anthony's Chrome at 1,440, 1,330 and 3,200 wide**: not yet.

### Checks run

- New tests: the reasons, the page checks end to end with Google faked (the order, the daily limit, a refusal, a failing
  page, the steps handing on, the www address), the reads and Ask Hakken's (every box kind, a reason with no pages, the
  empty page, tenancy), the screens and their saved looks (`look/V1Summary.txt`, `look/V1Detail.txt`), and the eye on all
  seven periods on More Handles' checks (`src/test/fixtures/moreHandlesSearchConsoleIndexing.json`).
- 99 affected test files, `npm run typecheck`, lint on the changed files and every guard pass. `check:words` fails only on
  two old allowlist entries.
- Every read loads on dev for More Handles, every period, a country and custom dates. Google was asked once
  (Search Analytics, October's UK pages).

## The chart, changed — 18 November 2026, evening

Anthony on the built page: "this graph is not about visits, it's the graph for the table below over time. I showed you
the Google graph earlier, that's what I wanted." The plan's item 4 had drawn the day Google last visited each page,
which was my misreading of his ask, and it drew nothing on Last month because every visit was in November.

- **Now**: "Pages not indexed each day", the kit's `BarsCard`, stacked. A bar for each day kept, split into the table's
  reasons, each a tick box in the Show menu in Google's words, drawn by its short name. It reads each day's counts
  (`pageIndexDays`, `days` in the summary read).
- **The days kept, whatever the dates chosen**, as Google's own chart shows its last three months. A day's counts carry on
  from the day before, so a bar is the state at the end of that day. The checks began on 18 November for More Handles, so
  the chart has one bar until more nights' checks are in. It rises through the first pass (about 10 days) as more pages
  are checked, which the progress line above it already says.
- Gone with it: the read's `crawlDays` and `neverVisited`, and `crawlDays` in `convex/utils/indexingFigures.ts`. A
  reason's Crawled column and a reason page's Last visited box still say when Google last visited.
- The board in `docs/plans/assets/search-console-indexing-v1/` still draws the old chart. Its saved look
  (`look/V1Summary.txt`) names the new one.

Also fixed on the first real checks the same afternoon: "The biggest reason" box and the eye's line are left out when
reasons tie, and the clicks box says "of the clicks on your pages", as its figure is the clicks Google tied to a page.
