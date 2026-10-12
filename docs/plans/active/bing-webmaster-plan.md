# Bing Webmaster — for your own websites

**Started 2026-10-12. Status: drawn, planned, not built.** The screens are
drawn on the canvas [Hakken — Bing Webmaster](https://claude.ai/artifact/2sjxHy3g6qswmxvtsRyk9c)
(nine boards, copies in [docs/plans/assets/bing-webmaster/](../assets/bing-webmaster/)).
Anthony asked for this plan the same day: "yes write this up in a plan
please". Nothing is built until he says go. The questions in §10 need his
answers first. Change a decision here, with a date, before building anything
that disagrees with it. Progress: §8.

Anthony, 2026-10-12, looking at ronins.co.uk in Bing Webmaster Tools: "do you
think like we have with search console we need a bing webmaster tools
sections in our data". Then, when one website showed no clicks: "some sites
have clicks so we need to add it just because one site does not we can't
exclude it". And on how it is stored: "presume this will be data normalised
like search console and analytics and optimised for speed and storage".

Bing Webmaster is phase-one scope in the product: "Search Console / GA4 /
Bing Webmaster … GA4 and Bing Webmaster not built" (`PRODUCT.md`, Part Two),
and ring one of the integrations (`PRODUCT.md` §9). The data-sources research
lists it as day one: "Bing Webmaster Tools API. Free. Same shape as Search
Console, thinner data, and it's the index behind Copilot and ChatGPT's
search" ([data-sources-and-integrations-sept-2026.md](../../product/data-sources-and-integrations-sept-2026.md)).

**Why it matters, in figures.** ronins.co.uk, the 90 days to 11 Oct 2026:
Bing 60 clicks from 19,600 impressions (0.31% click-through). Google 1,071
clicks from 962,071 impressions (0.11%). So Bing is about 5.3% of the
website's clicks from search. Its searchers click almost three times as
often. It is also the index Copilot and ChatGPT's search read.

**What this plan is not.** It does not change Search Console's or Google
Analytics' screens. Bing in Insights and in the Executive summary is §10, Q4.
Asking Bing to read a page again is a write, and §10, Q2 asks about it.
Copilot citations wait for Microsoft (§2.4).

## 1. Decisions

| # | Question | Decision | Status |
|---|---|---|---|
| BW1 | Add Bing at all | Yes, for every owned website, whatever its clicks today. | Agreed, 2026-10-12: "some sites have clicks so we need to add it just because one site does not we can't exclude it" |
| BW2 | How it is stored | As Search Console and Google Analytics are now: each page and keyword stored once per website and named by number, figures packed, ready-made periods, only what changed written, keep rules, and a reading-budget test at five times morehandles.co.uk (§4). | Agreed, 2026-10-12: "presume this will be data normalised like search console and analytics and optimised for speed and storage" |
| BW3 | The screens | The nine boards on the canvas (§5). | Drawn 2026-10-12. Anthony asked for this plan the same day. Locked once he agrees the canvas, with any comments he leaves on it |
| BW4 | Where it lives | Its own item in the main menu, "Bing Webmaster", straight after Search Console, listing the company's own websites; each opens its own pages with a side menu laid out as Search Console's. | Drawn 2026-10-12, matching Search Console, Google Analytics and Microsoft Clarity, which each have their own item. The name is §10, Q1 |
| BW5 | Read only | Hakken signs in with Bing's read-only permission (`Webmaster.read`) and never changes anything in Bing Webmaster Tools. | Proposed, as Search Console's. A write would need §10, Q2 |
| BW6 | Credits | Free in every plan: Bing charges nothing for the data. | Proposed, as Search Console (GA14) |
| BW7 | Conventions | Search Console's for everything not asked: owned websites only, a company admin connects, everyone in the company reads, disconnecting keeps what was collected, numbered tables of 25 to 100 rows sorted by their headings, What Hakken sees on every screen, English and Italian together. | Proposed, as Google Analytics took them (GA16) |
| BW8 | The agent that collects | "Bing Webmaster: Collector Agent" in Admin → Agents, with a new role, "Bing Webmaster Collector", and a schedule, "Bing Webmaster: Data Collection Scheduler", daily at 04:00 local, the same time as Search Console's and Analytics' (§4.1). | Proposed, as GA21 |
| BW9 | What is left out | Countries and devices: Bing does not give them to other tools (§2.4). Copilot citations: no API yet (§2.4). Neither is drawn. | Drawn 2026-10-12. Copilot citations come in when Microsoft opens them (§10, Q3) |
| BW10 | Every figure compared | Each figure on a Bing screen sits beside Google's for the same days, from Hakken's own Search Console, or beside Bing's own past. | Drawn 2026-10-12, as agreed for every screen on 2026-10-11 ("we know a stat is powerful when it has comparisons") |

## 2. How Bing's API works

Read from Microsoft's documentation on 2026-10-12. Nothing has been called
yet. Phase 0 (§7) confirms every point marked "to confirm" on Ronins' own
account.

### 2.1 The API, not a tool for one person

As for Search Console: Hakken collects for many companies on a server, so it
calls Bing's API directly. The JSON form is
`https://www.bing.com/webmaster/api.svc/json/<Method>`, with the site's
address as `siteUrl`.

### 2.2 Getting in

Bing Webmaster has its own sign-in, OAuth 2.0
([Microsoft: Accessing Bing Webmaster APIs using OAuth 2.0](https://learn.microsoft.com/en-us/bingwebmaster/oauth2)):

- **The app is registered** in Bing Webmaster Tools → Settings → API Access →
  OAuth Client, with a name people see and a return address, which must match
  exactly. That gives a client ID and a client secret.
- **Sign-in**: `https://www.bing.com/webmasters/OAuth/authorize`. A person can
  sign in to Bing Webmaster Tools with a Microsoft, Google or Facebook
  account.
- **Tokens**: `https://www.bing.com/webmasters/oauth/token`. An access token
  lasts an hour (`expires_in` 3599). The refresh token lasts until the person
  takes access back. The code from the sign-in lasts 5 minutes.
- **Permissions**: `Webmaster.read` ("View the user's Bing webmaster tool
  data") or `Webmaster.manage` (read and change). Hakken asks for read only
  (BW5).
- Every call carries `Authorization: Bearer <token>`.

### 2.3 What there is to read

From the API's own list of methods
([Microsoft: IWebmasterApi](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi?view=bing-webmaster-dotnet)):

| On screen | Bing's method | What it gives |
|---|---|---|
| The websites the account can see | `GetUserSites` | Each site and whether it is verified |
| Clicks and impressions, day by day | `GetRankAndTrafficStats` | The whole site's clicks and impressions a day |
| Keywords | `GetQueryStats` | Each keyword: clicks, impressions, average position when shown (`AvgImpressionPosition`) and when clicked (`AvgClickPosition`), and a date. To confirm: weekly rows, about six months, no choice of dates |
| Pages | `GetPageStats` | The same, for each page |
| A keyword's pages | `GetQueryPageStats` | The pages Bing showed for one keyword |
| A page's keywords | `GetPageQueryStats` | The keywords one page was shown for |
| A keyword over time | `GetQueryTrafficStats` | One keyword's figures over time |
| Crawling | `GetCrawlStats` | A day at a time: pages read (`CrawledPages`), errors (`CrawlErrors`), pages in the index (`InIndex`), links in, blocked by robots.txt, malware, and each kind of answer (2xx, 301, 302, 4xx, 5xx, other, DNS failures, timeouts) |
| Problems reading pages | `GetCrawlIssues` | Each page Bing had trouble with |
| One page in the index | `GetUrlInfo` | Whether one page is in Bing's index, and when Bing last read it |

**The position compared with Google's** is `AvgImpressionPosition`: like
Google's position, it is the average place the website was shown at.

### 2.4 What Bing does not give

- **Countries and devices.** Bing's own screen has them, but no method found
  gives them to other tools (BW9).
- **Copilot citations** (AI Performance, in preview since February 2026).
  Bing's screen offers them as a spreadsheet download only. Microsoft said in
  February 2026 that an API is "on their backlog". Hakken never asks a client
  to download and upload a file, so nothing is shown until there is an API
  (§10, Q3).
- **Chosen dates for keywords and pages.** `GetQueryStats` and `GetPageStats`
  take only the site: Bing sends what it has. To confirm in Phase 0.
- **Keyword and page lists for Copilot answers.** Bing's own screen says its
  "Keywords and Pages data is only available for Web traffic". So the totals
  include more than the lists add up to. Every screen says so in one line, as
  drawn.

### 2.5 Limits

Microsoft publishes no read limits. Hakken's asks are small: two a day per
website, two a week, and one a week per money page (§4.1). Phase 0 confirms
there is no limit Hakken would reach.

### 2.6 What Hakken already has

- **Search Console** for every connected website: Google's clicks,
  impressions and positions, by keyword and page, with ready-made 7, 30 and
  90-day and 12-month periods. This is what every Bing figure is compared
  with (BW10).
- **The shared page numbering** (`convex/holdPageRefs.ts`,
  `holdPageAddresses`): every page address of a website kept once and
  numbered, used by Search Console and Google Analytics.
- **The keyword books** (`convex/searchConsoleKeywordBooks.ts`): each keyword
  kept once a month per website.
- **The packing, periods and runner**: `convex/utils/searchConsolePacks.ts`,
  `convex/roleRuns.ts`, `convex/keepRules.ts`, `convex/storageMeasure.ts`.
- **Money pages** (`convex/moneyPageChecks.ts`): the pages that bring
  enquiries, already checked weekly against Google's index.
- **An encrypted token store** (`connectorTokenCrypto`), used by Google's and
  Clarity's connections.

## 3. Connecting (Phase 1)

One Bing connection per owned website, kept beside its Google one. A new
table, `bingConnections`, holds the website, the account, the site chosen in
Bing, its status and why it last failed. Its tokens go in `bingTokens`,
encrypted as Google's are. The return address is
`/api/bing-webmaster/oauth/callback`.

The screens (pages, never pop-ups):

1. **Not connected** (board 9): what the section will show, with Connect Bing
   Webmaster Tools for an admin, or "Ask one of your company's admins to
   connect it" for anyone else. One line says that a website not yet in Bing
   Webmaster Tools can be brought in from Google Search Console in a minute,
   with nothing added to the website.
2. **Bing's own sign-in and consent.**
3. **Choose the site**: from `GetUserSites`. When exactly one verified site
   matches the website's address (with or without `www`, `http` or `https`),
   it is shown for a yes, with "Not this one? See all", as Analytics'
   property is (GA22). None matching says so, with the account's email and a
   way to try another account.
4. **Connected** (board 8): the site, the account, when it was connected,
   when it last updated, how much history is held, and who collects it, with
   Disconnect.

- **Who**: the company's admins and super admins connect and disconnect.
  Everyone else in the company sees the figures. A read-only user never sees
  the buttons.
- **When access goes**: marked "needs reconnecting", the page says why, and
  the figures already held stay.
- **Disconnecting** keeps what was collected, marked "Disconnected on …",
  and stops collecting. It leaves Search Console and Analytics alone.
- **Tenant isolation**: a connection, its tokens and every figure it brings
  are the company's alone, read only through the owned website's hold.
  `convex/websiteTenancyGuard.test.ts` gains every new table.

## 4. Collecting and storing (Phase 2)

### 4.1 When

- **The Bing Webmaster: Collector Agent** (BW8), set up exactly as the Google
  Analytics: Collector Agent is:
  - `BING_WEBMASTER_COLLECTOR` beside `SEARCH_CONSOLE_COLLECTOR` and
    `GOOGLE_ANALYTICS_COLLECTOR` in `convex/utils/agentRoles.ts`, in a Bing
    group of its own in the Role dropdown.
  - A branch in `convex/agentRunStartService.ts` that starts its job.
  - The role's name in English and Italian.
  - No model is called, so a run costs nothing.
- **The schedule**, "Bing Webmaster: Data Collection Scheduler": daily at
  04:00 local (03:00 UTC). One run per connected website, a few seconds
  apart, on the shared runner (`roleRuns.ts`).
- **Every day**: the site's daily totals (`GetRankAndTrafficStats`) and its
  crawl figures (`GetCrawlStats`), with the last few days again while Bing's
  figures settle. How many days settle is to confirm in Phase 0.
- **When Bing's new week lands**: keywords (`GetQueryStats`) and pages
  (`GetPageStats`). The daily run checks whether Bing's newest week has
  changed and writes only when it has. So the keyword and page lists are
  built once a week, not every night: less reading and writing than Search
  Console's nightly build.
- **Every week**: each money page asked of `GetUrlInfo`, as Search Console's
  indexing check is.
- **A newly connected website** starts collecting at once, with everything
  Bing gives (about six months), as Analytics does (its §10, Q15). A client
  never meets an empty page for a night.
- **Asked when a screen opens, then held**: a keyword's pages
  (`GetQueryPageStats`), a page's keywords (`GetPageQueryStats`) and a
  keyword over time (`GetQueryTrafficStats`). Each is asked once and held
  until the next week's collection, so paging, sorting and searching never
  ask again.
- **No queue waits on a person**: a step that stops at a limit books the
  next (`AGENTS.md`).

### 4.2 What is kept, per website

| List | Kept | Read by |
|---|---|---|
| The site's totals: clicks and impressions | Day by day | Performance's figures and charts; the websites list |
| Crawl figures | Day by day | Crawling and indexing's figures and chart |
| Keywords: clicks, impressions, both positions | Week by week | Keywords, a keyword's screen, Bing against Google |
| Pages: the same | Week by week | Pages, Bing against Google |
| Money pages in Bing's index | On each money page's existing row | Crawling and indexing |
| Bing against Google | Ready-made each week (§4.4) | Bing against Google, and the Google columns on Keywords and Pages |

### 4.3 Stored once (BW2)

What Bing shares with Search Console and Analytics is stored once and named
by the same number:

| What | How |
|---|---|
| Page addresses | Bing's pages are cleaned by the one page rule (`normalisePage`) and numbered in the website's one page numbering (`holdPageAddresses`). `/ai-agency/` from Bing, Search Console and Analytics is one page with one number. |
| The website's page list | `holdPages` gains Bing's columns beside Google's and Analytics': shown on Bing, and clicks from Bing in the last 90 days. One row says what every source knows of a page. |
| Keywords | Bing's keywords go into the website's same monthly keyword book as Search Console's (`searchConsoleKeywordBooks.ts`, the all-countries book). A keyword then has one number on both engines, so Bing against Google is a join by number. |
| Money pages | Bing's "in the index" and "last read" go on the money page's existing row in `moneyPageChecks`, beside Google's, not on a second list. |
| Packing and periods | The same packed records (`utils/searchConsolePacks.ts`), the same ready-made periods (the last 7, 30 and 90 days and 12 months, each with the period before), built by the same code. A week of keywords is packed as a day of Search Console's is. |
| History | The same rule as Search Console's: days kept 90 days, then as weeks; after 12 months, as months. Bing's keywords and pages are weeks from the start. |
| Collecting | The shared runner (`roleRuns.ts`): a third role on it, not a third runner. |
| Keep rules, storage measure, tenancy | Every Bing table joins `keepRules.ts`, `storageMeasure.ts` and the tenancy guard. |

**Kept apart: only the figures.** Bing's clicks and positions measure Bing,
so they keep their own records, naming pages and keywords by the shared
numbers.

### 4.4 Bing against Google, ready-made

The comparison is built once a week, when Bing's new week lands, never while
a screen loads. For each keyword Bing shows the website for, it joins Bing's
90 days to Search Console's ready-made 90 days through the shared keyword
number. The result is Bing's position, Google's position, both engines'
clicks, and who ranks the website higher, or "Only on Bing". The same build
counts the screen's figures (keywords each engine ranks higher, keywords only
on Bing) and Bing's share of the website's search clicks each week. Bing's
weekly clicks go beside Search Console's weeks for the same days.

### 4.5 Proved before any client connects

As the core data plan proves its screens (its rule 4) and Analytics did
(GA23):

- Every screen has a reading-budget test at five times morehandles.co.uk's
  size, inside half of Convex's limits.
- Storage and the nightly and weekly writing are measured on Ronins, and on
  morehandles.co.uk once it connects.
- The cost per website goes into a new dated record beside
  [infrastructure-costs-oct-2026.md](../../product/infrastructure-costs-oct-2026.md),
  never by editing that one. Estimated 2026-10-12: a few pence to about 30
  cents a month per website, under Search Console's.

## 5. The screens (Phase 3)

Drawn 2026-10-12 from the drawing kit (stylesheet `bab6c21cec60`, look
`149d9f4fb243`), with Ronins' figures. All nine pass `npm run check:drawing`.
What is real and what is an example is noted on the canvas: Bing's totals and
keyword rows are real, from Bing's own screen, and so is every Google figure.
The page rows, the counts and the crawl figures are examples until Bing is
connected.

| Board | Screen | What it shows |
|---|---|---|
| 1 | Bing Webmaster (`/app/bing-webmaster`) | Your websites: each with Bing clicks, impressions, click-through, Bing's share of search clicks, and when it was updated |
| 2 | Performance | Clicks, impressions, click-through rate and Bing's share of search clicks, each beside Google's. The line that totals include Copilot answers and the lists do not. Clicks and impressions over time, with tick boxes. Bing's share of search clicks week by week, as bars with their figures on. Clicks each week, Bing against Google |
| 3 | Keywords | The same four figures; clicks and impressions each week; every keyword with clicks, impressions, CTR, position, Google's position and its top page. Filters: position, and on Google or only on Bing |
| 4 | A keyword's own screen | Its clicks, impressions, CTR and position, each beside Google's for the same search; position each week, Bing against Google; the pages Bing showed for it |
| 5 | Pages | The four figures; clicks each week to the five busiest pages; every page with its title, clicks, impressions, CTR, position and Google's clicks. Filter: the website's page classifications |
| 6 | Bing against Google | Bing's share of search clicks; keywords Bing ranks higher; keywords Google ranks higher; keywords only on Bing. The share week by week. Every keyword with both positions, both engines' clicks and who ranks you higher |
| 7 | Crawling and indexing | Money pages in Bing's index (Google's beside it), pages Bing read, errors, blocked by robots.txt. Pages read each day and errors. Every money page: in Bing's index or not, last read by Bing, last read by Google |
| 8 | Connection | Connected: the site, the account, the dates, the history held, who collects it, Disconnect |
| 9 | Connection, not connected yet | Connect Bing Webmaster Tools, and bringing a website in from Search Console |

Every site page has:

- The record header: back to Bing Webmaster, the website, "Updated …", the
  dates and the step.
- The side menu, in three groups: **Bing's figures** (Performance, Keywords,
  Pages, Crawling and indexing), **Against Google** (Bing against Google) and
  **Settings** (Connection).
- One line saying how new Bing's figures are, then What Hakken sees.

Charts take the full width, one under another. Every table is the standard
one: search box and filters, table bar with Download CSV, sorting headings
and numbered pages.

The dates offered are the last 30 and 90 days, 6 months, a year and a chosen
range. Keywords and pages snap to whole weeks, and the screens say so.

**Not drawn yet:** a page's own screen. Every page in Pages would open one,
as each keyword does (§10, Q6).

## 6. What Hakken sees on each screen (Phase 3)

Written by the same shared part as Search Console's (`HakkenSees`), in plain
words, each figure with its comparison (BW10). As drawn:

- **The websites**: what Bing brought each website, and its share of search
  clicks.
- **Performance**: Bing's clicks and impressions against Google's, and how
  often Bing's searchers click compared with Google's.
- **Keywords**: the keyword that brings the most from Bing, with both
  engines' positions, and how many keywords appear only on Bing.
- **A keyword**: where Bing ranks it against Google, and the clicks on each.
- **Pages**: the pages Bing sends more clicks to than Google.
- **Bing against Google**: Bing's share, how many keywords each engine ranks
  higher, and the biggest gap.
- **Crawling and indexing**: money pages missing from Bing's index, and when
  Bing last read them against Google.

Each links on to the screen that explains it. Nothing on these screens asks
the client to do work: they say what Bing shows and where to look.

## 7. What Anthony does (Phase 0)

No one else can: it is his Bing Webmaster Tools account. I do the clicks in
his Chrome, and he only pastes the secrets.

1. In Bing Webmaster Tools → Settings → API Access, accept the terms, then
   register an OAuth client: the name "Hakken" and the return address for the
   dev app.
2. Put the client ID and secret into the dev deployment's environment
   (`BING_WEBMASTER_CLIENT_ID`, `BING_WEBMASTER_CLIENT_SECRET`).
3. When Phase 1 is built: connect ronins.co.uk from its Bing Webmaster page.
   The sign-in is his.

Then, on Ronins' real account, Phase 0 confirms:

- the weekly rows and how far back keywords and pages go;
- how many days Bing's figures take to settle;
- that no read limit is near;
- whether a second return address (production) can sit on the same client.

## 8. Phases and size

| Phase | What | Size |
|---|---|---|
| — | The drawings (BW3) | One day: done, 2026-10-12 |
| 0 | Anthony's Bing setup and the checks on Ronins' account (§7) | Half an hour of his time; half a day of checks |
| 1 | Connecting: the two tables, the sign-in and its return, choosing the site, the two Connection screens (§3) | Two days |
| 2 | Collecting and storing: the role, agent and schedule; daily totals and crawl figures; weekly keywords and pages; the shared page numbering, keyword books and packing; money pages; keep rules, storage measure and tenancy guard; measured on Ronins (§4.1–§4.3) | Four days |
| 3 | The section: the websites list, Performance, Keywords, a keyword's screen, Pages, What Hakken sees (§5, §6) | Four days |
| 4 | Bing against Google: the weekly ready-made comparison and its screen (§4.4) | One and a half days |
| 5 | Crawling and indexing (§5, board 7) | One and a half days |
| 6 | Proof: reading-budget tests at five times morehandles.co.uk, the cost record, the full gate and GitHub's steps (§4.5) | One day |

About fourteen and a half days of building after Phase 0, plus whatever §10
adds. Every phase ends with its tests, with Bing faked as Google is for
Search Console: sign-in, refusal, renewal, access taken back, an unverified
site, two sites matching, an empty week, tenant isolation, and the screens.
Phase 3 ends in the browser on Ronins' own connected website.

**Progress, 2026-10-12: drawn and planned, nothing built. About one of
fifteen and a half days, about 6%.**

## 9. Risks

- **Bing's documentation is thin and old.** Much of §2.3 is Microsoft's
  method list and other developers' notes. Phase 0 checks each point on a
  real account before Phase 2 is built.
- **Weekly lists.** Keywords and pages move a week at a time, so "the last 7
  days" on those lists means the last whole week. The screens say so.
- **Small numbers.** Bing's figures are a twentieth of Google's for Ronins,
  so a click-through rate or position from a handful of impressions moves
  wildly. Proposed: grey a rate from fewer than 10 impressions, as Analytics
  greys one from fewer than 100 visits (§10, Q5).
- **Totals and lists differ**, because the lists hold web searches only
  (§2.4). Said on screen, as drawn.
- **Copilot citations may never get an API.** The section works without them.
- **The return address must match exactly** (§2.2). The dev and production
  addresses are checked in Phase 0.

## 10. Questions — for Anthony

| # | Question | Recommendation |
|---|---|---|
| Q1 | The menu item's name: "Bing Webmaster" (as drawn) or "Bing Webmaster Tools" (Microsoft's full name)? | "Bing Webmaster": shorter, and it sits beside "Search Console" |
| Q2 | When a money page drops out of Bing's index or changes, should Hakken ask Bing to read it again? That needs Bing's read-and-change permission (`Webmaster.manage`) and is a write. | Later, in its own plan. It is the agency's job, so Hakken should do it, but connect read-only first |
| Q3 | Copilot citations: add a screen when Microsoft opens an API? | Yes, when it exists; nothing before, since Hakken never asks a client to upload a file |
| Q4 | Bing in Insights and Ask Hakken: should the Executive summary's search figures count Bing, and should Ask Hakken read Bing's figures? | Ask Hakken reads them from Phase 3, which is small. Insights in its own change, drawn first |
| Q5 | Grey a click-through rate or position from fewer than 10 impressions? | Yes |
| Q6 | A page's own screen, opened from Pages, as a keyword's is? | Yes, drawn first, about half a day more |

## Change log

- **2026-10-12** — Plan written at Anthony's request ("yes write this up in a
  plan please"), after the nine boards were drawn on the canvas the same day.
  Bing's sign-in and method list read from Microsoft's documentation. Nothing
  built.
