# Sites — Search Console for your own websites

**Started 2026-09-27. Status: built but for Phase 4. All nine decisions
agreed 2026-09-27 (§1). Phases 1–3 — connecting, collecting and the Search
Console section — built 2026-09-27 and tested with Google faked (§10). Google
setup done and Ronins' own site connected on dev 2026-10-02 (§10); still to
do: the screens checked against Google's own Search Console, production's
setup, and "External" before a client connects with its own Google account.
Phase 4 is each part its own agreement. Screens beyond Google's own — three
drawn 2026-10-02 with Ronins' real figures, to be adjusted before anything
is agreed (§11). Collecting switched off and everything collected cleared
2026-10-02, the connection kept: collecting is to be a Search Console
agent's, on its own schedule, and nothing is collected in bulk until the
screens are agreed (§12). The Search Console Collector role built the same
day, a run of its own for each website. Screens redesigned on a new canvas
2026-10-02 — seventeen drawn, the §11 drawings dropped; nothing agreed or
built yet (§13).** Change a decision here, with a date, before building anything that
disagrees with it. Follow `AGENTS.md`: no code until Anthony agrees, and draw
the screens first (§1, SC9).

Anthony, 2026-09-27: "Next topic is Google Search Console via their API or
MCP server. For the owned sites we need to be able to authenticate to be
allowed to collect the owned website's Search Console database and display it
on our screens. This will be a new menu item in the left-hand navigation called
Search Console." Then: "Ok let's build a plan for this please."

Search Console is phase-one scope in the product: "the results column of the
P&L" (PRODUCT.md, "Search Console / GA4 / Bing Webmaster — not built"), and
"the results column of the page ledger" in the data-sources research
(docs/product/data-sources-and-integrations-sept-2026.md). It is the first
source of a site's **real** clicks — everything on the Sites screens today is
an estimate.

## 1. Decisions for Anthony

| # | Question | Recommendation | Days to build: recommended | Days: the other choice | Status |
|---|---|---|---|---|---|
| SC1 | Where it lives | **Its own section: "Search Console" in the main left-hand navigation, beside Sites**, listing the company's own websites; each opens its own Search Console pages. Nothing in Sites changes. (This plan had recommended a group in each site's menu in Sites instead; that was not what Anthony asked for.) | 1¼ (in Phase 3) — its own section, the list of own websites, its own layout | — | Agreed, 2026-09-27: "a new menu item in the left hand navigation called search console"; "Are you building this in a new section called search console on the left hand nav bar! Like I asked" |
| SC2 | How a company lets Hakken in | **"Connect with Google"**: someone with access to the site's Search Console signs in with Google and approves read-only access. The other choice, or as well: a Hakken robot email address the company adds as a user in its own Search Console — nothing to sign in to, nothing expires, one extra step inside Google per company. | 1½ (Phase 1) | 1 — the robot email alone; 2½ — both | Agreed, 2026-09-27 ("ok build thi splase") |
| SC3 | One connection per what | **Per owned website**: its page has its own Connect. A company with several owned websites connects each (the same Google account can serve them all — it signs in again). The other choice: one Google account per company, each owned website then choosing its property from it. | none extra (in Phase 1) | ½ more — a company-level connection screen, then a choice per website | Agreed, 2026-09-27 ("ok build thi splase") |
| SC4 | Who can connect and disconnect | **The company's admins, and super admins** — from the site's own Search Console page. Everyone else in the company sees the data; a read-only user never sees the buttons. | none extra (in Phase 1) | none extra | Agreed, 2026-09-27 ("ok build thi splase") |
| SC5 | How it is collected | **Its own daily job**, for every connected site whatever its company's collection schedule: it is free, and Korda collects monthly — its Search Console figures would otherwise be up to a month behind. Each day it fetches the newest days and fetches the last four again (Google's figures settle over two to three days). Every run is logged, and the page says when it last came in. The other choice: a step in each company's collection run, on its schedule, in the agents' runs and logs. | 2 (Phase 2) | 3½ — the Planner and Collector are built around paid requests, so it would need its own step in both, and lines in the run report | Agreed, 2026-09-27 ("ok build thi splase") |
| SC6 | History | **Every search and every page, every day**, as well as the totals and the splits by country and device: each search's and page's clicks, impressions, click-through rate and position for each day it was shown — all sixteen months on connecting (Google keeps no more), then each new day. Each search and page then has its own history by day, and the tables any dates. Size in §4.3. The other choice: the totals and splits by day, and the searches and pages only for a few set ranges (the last 7 and 28 days, 3 months). | none extra (in Phases 2 and 3) | ½ less — but no history for a search or a page, and no tables for other dates | Agreed, 2026-09-27 ("ok agree with store each day too") |
| SC7 | Disconnecting | **Keeps what was collected**, marked "Disconnected on …", and stops fetching; the Google access is revoked at Google. The other choice: delete the collected figures with it. | ¼ (in Phase 1) | ½ — deleting up to millions of rows takes a paged clear-out job | Agreed, 2026-09-27 ("ok build thi splase") |
| SC8 | A competitor's site | Settled by SC1: the section lists only the company's own websites, so a competitor's never appears. | none | none | Settled by SC1 |
| SC9 | Draw first | **Yes** — the four screens and the connect screens, drawn in full in the app's dark style with real rows and working clicks, before any code ("drawings are faithful renders"). | ½ | none — but changes found in the built screens cost more to make | Agreed, 2026-09-27 ("ok build thi splase") |

**As agreed: about nine days** — Phase 1 one and a half, Phase 2
two, Phase 3 three, Phase 4 one, the drawings half — after Anthony's half an
hour in Google (§7). Without Phase 4 (§6), seven.

## 2. How Search Console integration works

Read from Google's documentation on 2026-09-27; nothing called.

### 2.1 The API, not an MCP server

Google publishes no Search Console MCP server (as of August 2026 —
usecarly.com/blog/google-search-console-mcp). The ones that exist
(github.com/AminForou/mcp-gsc and others) are community wrappers around the
same API, for one person's AI assistant on their own computer. Hakken collects
for many companies on a server, so it calls the **Search Console API**
directly, as the Gmail connector calls Gmail's. Hakken's own assistant can
read what Hakken stores, later.

### 2.2 Getting in

- **Connect with Google (OAuth).** Scope
  `https://www.googleapis.com/auth/webmasters.readonly` — read-only — with
  `openid` and `userinfo.email` to know which account connected. Reported
  **non-sensitive since 2024** (metricspot.com/features/google-search-console):
  no Google review needed. To confirm in the Google Cloud console, which labels
  each scope when it is added (Phase 0).
- **The Google app must be published.** An app left in "Testing" issues
  connections that **die after seven days**
  (developers.google.com/identity/protocols/oauth2, "refresh token
  expiration"). Published, a connection lasts until it is revoked, its
  account loses access, or it goes unused for six months — never the case for
  a daily job. Google allows 100 live connections per Google account per app.
- **A separate Google app from the Gmail connector's.** Gmail's scopes are
  restricted, and reviewed by Google before an app using them is published;
  Search Console's app would otherwise wait on that review for no reason.
- **Which sites.** The account's properties are listed
  (`GET /webmasters/v3/sites`): a domain property (`sc-domain:ronins.co.uk`,
  every subdomain and protocol) or a URL-prefix one
  (`https://www.ronins.co.uk/`). Only an owner, full or restricted user can read
  its figures; an unverified user cannot.

### 2.3 What there is to read

`POST /webmasters/v3/sites/{property}/searchAnalytics/query`
(developers.google.com/webmaster-tools/v1/searchanalytics/query):

- **Figures**: clicks, impressions, click-through rate, average position.
- **Split by**: date, search, page, country, device, search appearance (and
  hour, for the last few days).
- **Kinds of result**: web (the default), image, video, news, Google News,
  Discover.
- **History**: sixteen months. **Delay**: two to three days for settled
  figures; `dataState: "all"` adds fresher, unsettled ones.
- **How much**: up to 25,000 rows a request, paged; at most **50,000 rows a
  day per kind of result**, the most clicks first
  (…/v1/how-tos/all-your-data). Google recommends asking one day at a time.
- **What is left out**: rare searches are hidden for privacy. The totals
  include them, a list of searches does not — so a list adds up to less than
  the total, and says so (§4.3). Asking by page and search together can drop
  a little more to answer in time.
- **Limits** (…/webmaster-tools/limits): 1,200 requests a minute per site and
  per user; 30 million a day per app; queries split by page and search, over
  long ranges, weigh more against a load quota measured over ten minutes and
  a day. **Free.**
- **Average position is Google's own**: averaged over every time the site
  was shown — every device, place and personalisation. It is not our ranking
  position (§8.2 of the data-completeness plan: normal results, one check, one
  place), and the screens never set one beside the other as if the same.

Also there, for later: the URL Inspection API (whether a page is indexed,
2,000 a day per site — for the Site audit), and sitemaps.

### 2.4 What Hakken already has

The Gmail connector built the platform's OAuth plumbing (`connectorOAuth.ts`,
`connectorOAuthProviders.ts`, `connectorTokenCrypto.ts`): the consent
redirect with a single-use state, the code exchanged server-side, tokens kept
only as AES-256-GCM ciphertext under `CONNECTOR_TOKEN_ENCRYPTION_KEY`,
renewal just before expiry plus an hourly sweep (`crons.ts`), revocation on
disconnect, and an audit entry. Search Console reuses all of it. What differs:
those connections belong to an admin-screen AI tool (`toolConnectors`) and
return to Admin; Search Console's belong to an owned website and start and
finish on the site's own screens (§3).

## 3. Connecting (Phase 1)

- **A second provider** in `connectorOAuthProviders.ts`,
  `google-search-console`: the same Google endpoints, its own client pair
  (`SEARCH_CONSOLE_GOOGLE_CLIENT_ID`, `SEARCH_CONSOLE_GOOGLE_CLIENT_SECRET`,
  no fallback to the sign-in app), and the account read from Google's
  userinfo endpoint rather than Gmail's profile.
- **Its own tables**, in a new `convex/searchConsoleSchema.ts` spread into the
  schema as `siteSchema.ts` is — `schema.ts` is frozen at its size band:
  - `searchConsoleConnections`: company, owned hold, status (pending,
    connected, needs reconnecting, disconnected), the single-use state,
    Google account, the property chosen and its permission, who connected and
    when, the last day collected, the backfill's progress, the last message.
  - `searchConsoleTokens`: ciphertext only, one row per connection; read by
    internal functions only, held by the function-access test as
    `connectorOAuthTokens` is.
- **Its own start and return**: `/api/search-console/oauth/authorize` and
  `…/callback` (the return registered with the new Google app), sharing the
  exchange, encryption, renewal and revocation code with the Gmail flow —
  lifted into one module both call, not copied.
- **The screens** (new screens, never pop-ups — `sites-no-modals`):
  1. Not connected: the Search Console page says what it will show, with
     **Connect Google Search Console** for an admin, or "Ask a company admin
     to connect it" for anyone else.
  2. Google's own sign-in and consent.
  3. Back in Hakken: **choose the property** — the account's properties that
     match the site's address, domain properties first. None matching says so,
     with the account's email, and a way to try another account.
  4. Connected: "Connected to sc-domain:ronins.co.uk as name@… · Last updated
     …", with Disconnect for an admin.
- **When access goes** (the account loses the property, Google revokes the
  app): the connection is marked "needs reconnecting", the page says why in
  plain words, and the figures already held stay.
- **Tenant isolation**: a connection, its tokens and every figure it brings
  are the company's alone — read only through the owned hold, like the private
  tracking lists (`holdLists.ts`), with a guard test that fails a read that
  goes round it.

## 4. Collecting (Phase 2)

### 4.1 When

As SC5 decides. Recommended: a daily job — after the connector sweep — that
takes each connected site in turn: the new days since the last collected one,
and the last four days again, replacing them.

### 4.2 What, per site

1. **Totals by day**, for each kind of result: one request covers the whole
   range (a row a day).
2. **By country and by device**, by day.
3. **By search, and by page**, one day at a time — up to 50,000 rows a day,
   paged by 25,000.
4. **Search appearance** (rich results, video and so on), as Google asks:
   its kinds first, then each.

**On connecting**, sixteen months, worked back from yesterday in small steps
— a few weeks per step — so no step outlasts a Convex action, the screens
fill in as it goes, and a stop resumes where it was. Searches by page
together (the heaviest ask) only if the screens need them (§6).

### 4.3 Storage

- **Day rows** (totals, and by country and device): small — at most a few
  hundred thousand rows per site over sixteen months.
- **Searches and pages by day** (SC6): a row for every search and every page
  on every day it was shown, for all sixteen months — its clicks,
  impressions, click-through rate and position. The large part: Ronins' site
  a few hundred searches a day, about 200,000 rows over sixteen months;
  kordatackle.com likely a few thousand a day, about two million rows, around
  half a gigabyte with its indexes — to be checked against the Convex plan's
  storage before its backfill, and measured as it lands. Search Console is
  only ever a company's own website, so no competitor adds to it. So:
  - each Search Console table reads from a **compact copy**, worked out as
    each day lands — exactly how the Keywords table reads its keyword copy —
    for exact totals, numbered pages and sorting by headings over the whole
    list; the usual ranges ready-made, any other dates worked out when asked;
  - a search's or page's own screen reads **its own days** straight from
    them: at most a few hundred rows.
- **Named and hidden**: every table says how much of the site it covers —
  "1,240 of 1,610 clicks come from searches Google names; the rest are hidden
  by Google for privacy" — the data-completeness rule, whole or saying which
  part.

### 4.4 Logged

Each run: the site, the days fetched, the rows, anything refused and why.
The Search Console page shows the last update; an admin screen lists the runs
if SC5 goes to its own job, or they sit in the collection run's report if it
goes with the runs.

## 5. The screens (Phase 3)

The section **Search Console** in the main left-hand navigation (SC1): a
list of the company's own websites and, for each, four pages and its
connection. Nothing in Sites changes.
Everything built from the screen kit and the Sites rules — the page header,
the date range and "compare with", numbered pages of 25/50/75/100, sorting by
headings over the whole list, downloads, EN and IT.

1. **Performance** — the headline: clicks, impressions, click-through rate
   and average position for the dates chosen, each against the period before;
   one chart of them over time (clicks and impressions shown, the other two a
   tick away), as in Search Console itself; a switch for the kind of result
   (web, image, video, news, Discover). The "named and hidden" line.
2. **Searches** — every search the site was shown for: clicks, impressions,
   click-through rate, position, the change against the period before;
   filters by device and country. Each opens **the search's own screen**:
   its days, the pages Google showed for it, and — where the search is on the
   keyword list — our own ranking of it, one link away, never on the same
   axis.
3. **Pages** — every page shown: the same figures. Each opens **the page's
   own screen**: its days, and the searches it was shown for.
4. **Countries and devices** — where the clicks came from, and on what: a
   table each, with shares of the site's clicks.

Plus the connect screens (§3).

## 6. Joining it to what is there (Phase 4, after the four pages)

- **Overview**: the site's real clicks a month beside the estimated visits,
  each named for what it is.
- **A keyword's screen** and **a page's screen**: their Search Console
  figures for the last 28 days.
- **The Sites list**: a column of real clicks for owned sites.

Each is small; each is its own agreement.

## 7. What Anthony does (Phase 0)

No one else can: it is his Google account and his secrets.

1. In Google Cloud — a project of his choosing — enable the **Google Search
   Console API**.
2. The **OAuth consent screen**: external, app name Hakken, a support email;
   add the scopes `…/auth/webmasters.readonly`, `openid` and
   `…/auth/userinfo.email`. Check the label Google puts on the Search Console
   scope: non-sensitive means no review; sensitive means Google reviews the app
   first (days to weeks), and SC2's robot email becomes the way to start.
3. **Publish** the app ("In production") — or connections die after seven
   days.
4. Create an **OAuth client** (web application) with the redirect address
   `https://quaint-zebra-2.convex.site/api/search-console/oauth/callback`
   (dev's; production's is its own Convex site with the same path).
5. Put its client ID and secret into the dev deployment's settings as
   `SEARCH_CONSOLE_GOOGLE_CLIENT_ID` and `SEARCH_CONSOLE_GOOGLE_CLIENT_SECRET`.
   Dev does not have `CONNECTOR_TOKEN_ENCRYPTION_KEY` yet (checked
   2026-09-27): `npx convex env set CONNECTOR_TOKEN_ENCRYPTION_KEY "$(openssl
   rand -base64 32)"` makes and sets one without showing it. `SITE_URL` on dev
   is `http://localhost:3000`, where the sign-in comes back to.
6. When built: connect Ronins' own website from its Search Console page — the
   sign-in is his, never Claude's.

## 8. Phases and size

| Phase | What | Size |
|---|---|---|
| 0 | Anthony's Google setup (§7) | Half an hour of his time |
| — | The drawings (SC9), agreed before any code | Half a day |
| 1 | Connecting: provider, tables, start and return, choosing the property, renewal, disconnect (§3) | One and a half days |
| 2 | Collecting: the daily job, sixteen months on connecting, the copies, the log, measured on Korda (§4) | Two days |
| 3 | The four screens and each search's and page's own (§5) | Three days |
| 4 | Joining it to Overview, keyword and page screens, the Sites list (§6) | One day, each part its own agreement |

About seven and a half days of building after Phase 0 and the drawings. Every
phase ends with its tests (the flow with Google faked: state, expiry, missing
scope, renewal, revocation, paging, the four days again, tenant isolation, the
screens) and the full gate; Phase 3 ends in Chrome on Ronins' own connected
site.

## 9. Risks

- **Google's review.** If the Search Console scope is labelled sensitive
  after all, publishing waits for Google's review; the robot email (SC2) works
  meanwhile.
- **Size** (§4.3): every search and page by day is about two million rows
  for kordatackle.com — checked against the Convex plan's storage before its
  sixteen months are fetched.
- **Two measures side by side.** Search Console's clicks and positions are
  real and Google's own; the rest of Sites is estimated, or checked once from
  one place. Never on one axis, never under one name — the lesson of the
  Competitors chart (data-completeness plan, §8.7).

## 10. Built

### Phases 1 and 2 — 2026-09-27

The backend, with no screen yet. Tested end to end with Google faked at the
network (`convex/searchConsole.test.ts`, `convex/searchConsoleApi.test.ts`),
and in the tenancy guard (`convex/websiteTenancyGuard.test.ts`).

- **Tables** — `convex/searchConsoleSchema.ts`, spread into the schema:
  connections (one per owned website), tokens (ciphertext only), day totals,
  rows (each search, page, country, device and search appearance by day), runs.
- **Google** — `convex/searchConsoleApi.ts`: the account's properties, which
  of them are the website, and the figures, paged by 25,000 to Google's 50,000
  a day, fresh figures included. `convex/searchConsoleDays.ts`: Google's days,
  Pacific time, sixteen months back.
- **Connecting** — `convex/searchConsoleConnect.ts`: start (company admins and
  super admins, owned websites, only once the Google app is set), Google's
  sign-in with its account picker, the return, choosing the property,
  disconnecting, and what the site's page reads. The exchange, renewal and
  revocation are now one copy shared with the Gmail connector
  (`convex/oauthTokenCalls.ts`). Routes `/api/search-console/oauth/authorize`
  and `…/callback` (`convex/http.ts`).
- **Collecting** — `convex/searchConsoleSync.ts`: the daily job
  `search-console-daily` at 09:00 UTC (in the job ledger, so Admin → Health
  shows it); the new days and the last four again; sixteen months back on
  connecting, a week a step; every write checked against the connection and
  its property. A website the company no longer holds takes its Search
  Console with it (`websites.ts`, `websitePurge.ts`).

What the build settled that the plan had not:

- **The only property that is the whole site connects at once**; several, or
  only part of the site (an address with a path), wait for the admin to
  choose. A sign-in to mend a connection keeps its property; after a
  disconnect the admin chooses again. Another property is had by
  disconnecting and connecting again: the old one's figures are cleared
  before the new come in, never mixed.
- **Google's access is one grant per Google account**, and revoking it for one
  site would cut off every other site using the same account — in this
  company or another (an agency's account reading its clients' sites). So a
  disconnect gives the access back only when no other connection uses that
  account.
- **All six kinds of result** are collected: web, image, video, news, Discover
  and Google News. Discover and Google News have no searches and no search
  appearance — nobody typed anything.
- **Search appearance** is kept by day as its own split (which rich results
  and how many clicks); asking for each one's searches and pages (§4.2 point
  4, "then each") waits until a screen needs it.
- **A sign-in that cannot connect says why** on the site's page: declined at
  Google, Search Console access left unticked, no property for the site in
  that account, or one the account is not verified for — with the account it
  was tried with. Whatever Google granted is handed back.
- **When the job runs.** 09:00 UTC: Google's days are Pacific time, and by
  then yesterday has ended there too.

### The drawings — 2026-09-27

Drawn as the app draws itself (SC9), then redrawn the same day with Search
Console as its own section in the main navigation, as Anthony had asked (SC1).
"ok continue pleae" — build as drawn.

### Phase 3 — the Search Console section, 2026-09-27

- **The section** — "Search Console" in the main left-hand navigation, under
  Sites (`SidebarNavTrees.tsx`), and in the top bar. `/app/search-console`
  lists the company's own websites with their connection and last thirty days;
  a website opens `/app/search-console/<site>` — Performance, Searches, Pages,
  Countries and devices, and **Connection**, a fifth page the drawings added
  for connecting, choosing the property and disconnecting. Nothing in Sites
  changes.
- **Reads** — `convex/searchConsoleReads.ts`: the list, Performance, one
  search's or page's own days, and the pairing below. `convex/searchConsoleCopies.ts`:
  the tables' lists worked out into the Sites compact copies (a new kind,
  `gsc`, which the Sites rebuilds and sweep leave alone), built when a table
  first asks for its dates and again after Google's next day lands — the last
  one shown meanwhile, and dates nobody has asked for in two days removed; up
  to 25,000 rows a list, the most clicks first; downloads built on the server.
- **Screens** — `src/app/(dashboard)/app/search-console/`, built from the
  screen kit and the Sites parts, imported rather than copied: the date
  control and its address keys, the pagers (25/50/75/100), sorting by
  headings, the table bar, the figures and the line chart.

What the build settled that the plan had not:

- **"Last 30 days" ends on Google's newest day**, not today, as Search
  Console's own reports do — its figures run two or three days behind, and a
  range ending today would read as a fall. Dates chosen by hand are read as
  chosen.
- **Which pages Google showed for a search, and which searches for a page, are
  asked of Google when that screen opens** — free, any dates, nothing stored;
  that pairing is not among what is collected (agreed with the drawings).
- **No device or country filter on the Searches table**: those splits are the
  Countries and devices page (agreed with the drawings).
- **The kind of result** (web, image, video, news, Discover, Google News) is
  chosen on every page and kept as the reader moves between them.
- **The change** in the tables and figures is against the same number of days
  before — shown only when those days are held, never against a part.
- **The day's named clicks** are kept with each day's totals, so Performance
  says how many of the clicks came from searches Google names and how many it
  hides for privacy.
- Two shared Sites parts grew, with no change to any Sites screen: the table
  bar counts countries and devices, and the line chart can run one line's
  scale from the top (average position beside clicks). The Sites table rules
  in `src/pagination-drift.test.ts` now hold Search Console's tables too.

### Every limit in the section — stated 2026-09-28

Anthony, 2026-09-28: "This better not be another cap you have not told me
about." All of them:

- **Google's own**, which nothing can lift: sixteen months of history; at most
  50,000 searches (and 50,000 pages) a day for each kind of result; the rare
  searches it hides for privacy — counted in the totals, never in a list, and
  the Performance and Searches pages say how many clicks they were.
- **Ours, and said on the screen when they bite**: a Searches or Pages list
  keeps the 25,000 with the most clicks for the dates chosen — each page of a
  table reads its whole list at once — and the footer then says "the full list
  is longer"; the pages Google showed for a search (or the searches for a
  page) show the 250 with the most clicks, with the same footer; the countries
  and devices tables hold 500 rows, which neither can reach.
- **Ours, that bit nothing**: the daily run collected at most 500 connected
  websites and would have left the rest waiting, unsaid. Removed the same day:
  it now goes through every connected website, a hundred at a time.

Still to come: Anthony's Google setup (§7), then the check on Ronins' own
connected site; an admin list of the runs (§4.4 — logged already, and the
daily job shows in Admin → Health); Phase 4, each part its own agreement.

### The Google setup, and Ronins connected — 2026-10-02

§7 done on dev, differently from how it was written in three places:

- **The existing Hakken project** (`hakken-509309`), not a new one (Anthony:
  "its not a new project we already have a hakken project"). Its sign-in
  screen had no scopes, so no Gmail scope to bring a review with it. The
  Search Console API is enabled there.
- **Internal, not published.** The project's user type is Internal: only
  ronins.co.uk Google accounts can connect, with no review and no seven-day
  expiry, so nothing was published. A client connecting with its own Google
  account needs "Make external" and publishing first. Google lists all three
  scopes (`webmasters.readonly`, `openid`, `userinfo.email`) as
  non-sensitive, so neither step waits for a review. If the existing
  "Hakken Web" client is the sign-in, External opens Google sign-in to
  accounts outside Ronins too; Hakken's own accounts still decide who gets in.
- **Dev's return address only.** The client "Hakken Search Console" (web
  application) holds
  `https://quaint-zebra-2.convex.site/api/search-console/oauth/callback`.
  Production's is not added: the production deployment (`quiet-labrador-142`)
  had no environment variables at all when checked, sign-in's included.

Dev now holds `SEARCH_CONSOLE_GOOGLE_CLIENT_ID` and
`SEARCH_CONSOLE_GOOGLE_CLIENT_SECRET` (pasted by Anthony) and
`CONNECTOR_TOKEN_ENCRYPTION_KEY` (generated, never shown). Anthony then
connected ronins.co.uk from localhost: property `https://www.ronins.co.uk/`,
as anthony@ronins.co.uk, owner. The newest days came in at once and the
sixteen months began, back to about 1 June 2025.

**Size, measured.** About 28,000 rows a week, so about two million over
sixteen months: ten times the 200,000 §4.3 estimated for Ronins, and what it
expected of kordatackle.com. Anthony: the Convex plan is paid. A week takes
about 85 seconds, the sixteen months about an hour and a half.

Still to come: the screens checked against Google's own Search Console for
the same dates, once the sixteen months are in.

## 11. Beyond Google's own screens — proposed 2026-10-02

Anthony, 2026-10-02, in his words paraphrased: the built section reads as a
replica of Search Console and needs taking up a notch or two. Is the data
relational, so that screens more informative than Google's can be made —
more like Sites', but under Search Console — understanding first what is
possible? Then, of the drawings: "this needs adjustments". **Nothing here is
agreed, and nothing is built.**

### 11.1 What the data allows

- **Google's side.** Each figure is clicks, impressions, click-through rate
  and position for one combination of up to five things: search, page, day,
  country and device. Hakken stores each of those by day **on its own**
  (§10), not in combination; the pages Google showed for one search (and the
  reverse) are asked of Google when that screen opens, the 250 with the most
  clicks.
- **What it joins to in Sites.** By the **search**: our ranking check and its
  history, searches a month, advert price, difficulty, intent, and Google's
  features on it (an AI Overview, and whether the website is named in it). By
  the **page**: its type, section, the audit's findings, linking websites,
  and the AI answers that cite it. By the **day**: Google's updates, and the
  ranking history.
- **Possible now**, from what is held: a page ledger (each page's real clicks
  beside what Sites knows of it, and what is holding it back); almost there
  (searches at positions 4 to 20 and what the top three would bring); shown
  but not clicked; losing ground; sections and page types; missed demand
  (searches tracked with real volume Google barely shows, and searches Google
  shows that are not tracked); brand against non-brand (with a list of brand
  words); and what each Google update did.
- **Not possible now.** Pages competing with each other for one search needs
  the search-and-page pairs stored — roughly the size of §10's two million
  rows again. Leads and sales need Google Analytics or a CRM, neither built.

### 11.2 Drawn — Page ledger, Almost there, Losing ground

Three boards on one canvas, in the Sites screens' own look (Anthony chose "Top
3 on one canvas"): https://claude.ai/artifact/2QFLfBk7ZhRdeRtD5d2fVK —
private to Anthony until shared from its Share menu. Every row is
ronins.co.uk's real figures on dev, read from the Search Console and Sites
screens on 2026-10-02. What the drawings propose, each still to agree:

- **The side menu** gains a group, "What to do", above Google's own pages
  ("Google's figures"), with Connection under "Settings".
- **Page ledger** (last 90 days): page and its type, clicks with a month's
  share, showings, Google's position, Sites' estimated visits, linking
  websites, AI answers citing it, and a verdict — Earning, Page two or three,
  Not competing, or Estimate far too high — with one line of why. "What
  stands out" above the table: three findings, each a sentence with its page.
  The sharpest: Sites estimates /hub/what-is-a-web-application/ at 1,033
  visits a month; Google counted 4 clicks in 90 days.
- **Almost there** (last 30 days): searches on the keyword list at Google's
  positions 4 to 20, a track from 1 to 20 for each, and what reaching the top
  three would bring — searches a month × the website's own click rate in
  positions 1 to 3, less the clicks it brings now — and its worth at the
  search's advert price. A second tab for searches not on the keyword list.
  The drawing's 2.5% is worked out from the searches readable on screen; the
  screen would use all of them.
- **Losing ground** (3, 6 or 12 months against the same before): each falling
  page's clicks, showings and position then and now, and why — **Ranking
  fell** (three places or more worse), **Shown less** (a quarter fewer
  showings at about the same place), or **Clicked less** (shown as often at
  the same place, clicked less: often an AI Overview or a rival's snippet).
- Google's average position and Sites' single check are never set on one
  axis or under one name (§9).

### 11.3 Found in the built section while drawing (not fixed)

- **A table's list is not worked out again when older history lands.** A list
  is built once for its dates, and again only after Google's next day lands
  (`convex/searchConsoleCopies.ts`, which decides "comparable" when it
  builds). Lists built before the sixteen months arrived keep saying "No
  change shown: the days before aren't held" until the next daily run, though
  those days are now held.
- **The Pages table shows one page several times.** For example,
  /hub/accessible-design-for-neurodiversity/ appears seven times with
  different figures. Likely addresses Google counts apart (a part after `#`,
  a query or a host) shown with the differing part hidden. To check.

## 12. Collecting switched off, everything collected cleared — 2026-10-02

Anthony, 2026-10-02, on the proposal to store which searches went to which
page: "we must never bulk back full data from search console", then
"actually its free but we should never bulk collect until we are happy";
"please delete all those we dont want or need them — we are architecturally
going to brainstorm and we may need to pull again"; "data needs to be
controlled through a search console agent which then has its own schedule";
and of the daily job: "we are going to cancel that hidden job it should never
have been there". He chose to stay connected.

This supersedes SC5 (its own daily job) and the sixteen months on connecting
(§4.2, SC6's history):

- **The hidden daily job is gone**: `search-console-daily` out of
  `convex/crons.ts` and the job ledger, and its fan-out to every connected
  site (`collectAllDaily`) removed.
- **Nothing starts collecting**: connecting, or choosing another property,
  collects nothing (`searchConsoleConnect.connectTo`,
  `searchConsoleSync.clearFigures`). The collecting itself stays
  (`collectRecent` and its steps), for the agent to start.
- **Everything collected for ronins.co.uk cleared** on dev — the day totals,
  the 2.16 million rows of every search, page, country, device and search
  appearance by day, and the tables' copies — by
  `searchConsoleSync:clearCollected`, run by hand. The Google connection and
  its sign-in stay, so collecting again needs no new sign-in. The run log (71
  runs: what was asked of Google, not the figures) stays.
- **The screens say so**: a connected site with nothing collected says
  "Connected, with nothing collected yet" instead of offering to connect
  again, and the Connection page says nothing is collected for now.

Anthony then made the agent and its schedule himself: **Search Console:
Collector Agent** in Admin → Agents, and **Search Console: Data Collection
Schedular** in Admin → Schedules, daily at 04:00 local (03:00 UTC).

**The role, built the same day** (Anthony: "we need to build the role that
goes in here on the agent that actually does the collection", then "a unique
run per website so we never hit a limit"): **Search Console Collector**, under
"Search Console" in an agent's Role dropdown (`convex/searchConsoleAgentRun.ts`).
The run its schedule or Run starts begins a run of its own for every connected
website, five seconds apart; each collects only the newest days and the last
four again — never the sixteen months — in steps of a week at most, each an
action of its own, with a line per step and a plain summary in the agent's
Observability. A run started while any of the agent's runs is going stops.
Anthony picks the role on his agent himself.

## 13. The screens, redesigned — drawn 2026-10-02 (nothing agreed or built)

Anthony, 2026-10-02: the built section "feels very search console like and
not very hakken like"; it should behave like Sites, Ahrefs and Semrush —
meaning how they display data, not how they show Search Console's — and the
§11 drawings were "too flashy with table rows used to display graphical style
data which I hate". §11's three boards are dropped. Rows in the drawings are
made up: "we are only drawing a UX we don't need real data".

**The canvas**: https://claude.ai/artifact/YSWaPwCuywp292S4rfeUQf
("Search Console — keywords and pages", private to Anthony; version 12,
"17 screens"). Every look below was asked for in his words on the way.

### 13.1 What the screens share

- **Tables exactly as Sites'**: the search bar and filter dropdowns on one row
  above the table; the table bar with its count and Download all (CSV);
  headings that sort when clicked — best first, again for the other way — with
  Sites' arrows; Sites' numbered pager and 25/50/75/100 rows. Numbers and
  words only in rows: no bars, tracks or coloured verdicts.
- **Tables fit the page** (Anthony: "Why can't we design data that fits"): no
  sideways scrolling on a 1440px screen, where about 920px is left beside the
  app's sidebar and the section's menu. Number columns sized to their
  headings, text columns sharing the rest, a before and after in one column
  ("31 → 43"), and Sites' short headings where it has one ("Volume").
- **Every row opens its detail screen**: a page's, or a keyword's.
- **The website's own icon** beside its name, as in Sites.
- **Google's updates exactly as on the Sites charts**: the approved markers,
  hover card and key (knowledge-news-and-digest plan, "The approved look"), and
  the updates from Admin → Content → Google updates — the same list.
- **Hero boxes** for the key totals — clicks, impressions, CTR, average
  position — each with its change on the 30 days before.
- **The side menu, grouped**: Performance, Keywords, Pages, Countries and
  devices; Changes; Opportunities; Breakdowns; Settings → Connection.

### 13.2 Keywords and pages, both ways

- **Pages** and **Keywords** lists; a **page's detail** (its hero boxes, a
  340px chart of clicks and impressions beside a "Where the clicks came from"
  panel of countries and devices, then the keywords that brought people to
  it) and a **keyword's detail** (the same, with the pages it brought people
  to). Countries and devices sit beside the chart — at the bottom of the page,
  Anthony: "nobody will ever see it".
- **Tracking, as Sites does it**: a Track tick box first in every table (tick
  to add, untick to take off), tracked rows tinted, a Tracked filter, "Track
  this page / keyword" on the detail screens. **Limits as in Sites,
  configurable the usual Hakken way** (platform default, then company, then
  website) and shown as "x of y tracked"; a full list says "All 100 tracked.
  Untick one to track …". Proposed, not chosen: tracked keywords per website
  50/100/200/500/1,000, default 200; tracked pages 25/50/100/200/500, default
  100; no cost — Search Console is free.

### 13.3 Thirteen more pages

Changes: **Position bands**, **New and lost**, **Wins and losses**, **Google
updates**. Opportunities: **Almost there**, **Shown but not clicked**, **Missed
demand**, **Pages competing**. Breakdowns: **Types** (its own page, Anthony:
"no i think this its own page" — Sites' "Pages by kind" bars with Google's
clicks, and keywords by what they want), **Brand and non-brand**, **Click rate
by position**, **Rich results**, **Real against estimated**. Drawn to be
looked at; none agreed.

### 13.4 Parked, to discuss with the data

- **Which keyword went to which page.** Pages' "Keywords" and "Top keyword",
  a keyword's "Your pages", and Pages competing need Google's keyword-and-page
  pairs: stored (more data, collected once the screens are agreed) or asked of
  Google when a screen opens. Anthony: "we will be discussing this later for
  now we just work on UX and UI".
- **Pages and keywords Sites has never seen** need a type and an intent, by
  their address or the Decision Maker: a small AI cost.
- **Google's AI answers report** (AI Overviews and AI Mode impressions) is not
  in the Search Console API: Google's API definition of 23 September 2026 has
  no such type, and a live test on ronins.co.uk was refused for every AI type
  and search-appearance name. Anthony: "lets wait".

## Change log

- **2026-09-27** — Plan written: how Search Console integration works, what
  Hakken already has, and nine decisions for Anthony.
- **2026-09-27** — The days each decision takes to build, its recommendation
  and the other choice (Anthony: "I meant days effort to develop"). SC6's
  recommendation made precise — every search and page by day — and left open:
  it had been recorded as Anthony's direction by a misreading of his question.
- **2026-09-27** — SC6 agreed: every search and page stored by day (Anthony:
  "ok agree with store each day too").
- **2026-09-27** — All nine decisions agreed (Anthony: "ok build thi splase").
  Phases 1 and 2 built and tested with Google faked (§10). §7 given dev's exact
  return address and the missing encryption key.
- **2026-09-27** — SC1 put right: Search Console is its own section in the main
  left-hand navigation, as Anthony asked ("a new menu item in the left hand
  navigation called search console"; then "Are you building this in a new
  section called search console on the left hand nav bar! Like I asked"), not
  a group in each site's menu in Sites. SC8 settled by it. Google's sign-in
  now returns to the section (`/app/search-console/<site>/connection`).
  About nine days as agreed.
- **2026-09-27** — Phase 3 built as drawn (Anthony: "ok continue pleae"): the
  Search Console section, its reads and its tables (§10). The screens were
  checked in the app in their not-set-up state; the connected ones by tests
  until the Google setup is done.
- **2026-09-28** — The daily run goes through every connected website rather
  than stopping at 500; every limit in the section stated (§10).
- **2026-10-02** — Google setup done on dev in the existing Hakken project,
  left Internal; ronins.co.uk connected and its sixteen months coming in,
  measured at about two million rows (§10).
- **2026-10-02** — Screens beyond Google's own (§11): what the data joins to,
  what is possible, and three drawn with Ronins' real figures — Page ledger,
  Almost there, Losing ground. To be adjusted; nothing agreed. Two faults in
  the built section noted, not fixed.
- **2026-10-02** — Collecting switched off and everything collected cleared,
  the connection kept (§12): no hidden daily job, nothing collected on
  connecting, and no bulk collecting until the screens are agreed. SC5 and
  the sixteen months on connecting superseded; collecting is to be a Search
  Console agent's, timed by Admin → Schedules.
- **2026-10-02** — The Search Console Collector role built: a run of its own
  for each connected website, newest days only (§12).
- **2026-10-02** — The screens redesigned on a new canvas, seventeen drawn:
  keywords and pages both ways, Sites' tables, tracking with limits, and
  thirteen more pages. §11's drawings dropped. Nothing agreed or built (§13).
