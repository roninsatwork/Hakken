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
built yet (§13). How the data is collected and kept agreed the same day — as
the screens read it, days for 90 days then weeks then months — with the build
in phases, about 21 days (§14).** Change a decision here, with a date, before building anything that
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

## 13. The screens, redesigned — drawn 2026-10-02, built 2026-10-03 (§15)

Anthony, 2026-10-02: the built section "feels very search console like and
not very hakken like"; it should behave like Sites, Ahrefs and Semrush —
meaning how they display data, not how they show Search Console's — and the
§11 drawings were "too flashy with table rows used to display graphical style
data which I hate". §11's three boards are dropped. Rows in the drawings are
made up: "we are only drawing a UX we don't need real data".

**The canvas**: https://claude.ai/artifact/YSWaPwCuywp292S4rfeUQf
("Search Console — keywords and pages", private to Anthony). Every look below
was asked for in his words on the way. Of the drawings: "i love these", then
"these are great can we save these".

**Saved in the repo**: `docs/plans/assets/search-console-redesign/` — each
screen's drawing (`<Screen>.dc.html`), the canvas layout (`canvas.json`) and
the Ronins icon they use, as of 2026-10-02 (canvas version 14, "Tables fit").
They are the canvas's own files: published to a Design canvas they draw
again exactly as they are there.

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
  Untick one to track …". **Chosen 2026-10-02** (Anthony: "yes please set
  these as long as I set these in a drop down in the UI in the same place as
  the other limits"): **tracked keywords per website** — 50, 100, 200, 500 or
  1,000, **default 200**; **tracked pages per website** — 25, 50, 100, 200 or
  500, **default 100**. Each a dropdown on the Limits screens beside the
  other limits, at all three levels: System Settings → Limits for the default,
  a company's Limits page, a website's Limits page. No cost — Search Console
  is free.

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

## 14. The data: collected once, kept as the screens read it — agreed 2026-10-02

Anthony, 2026-10-02: "2.16 million records is excessive and we need to make
the use of rollups etc. Let's brainstorm the best way to get this data without
doubling storage, let's get it the way we need it once." Then, of the proposal
below: "keep 30 days", "yes to the 90 days then weeks months etc". This
supersedes SC6 (every search and page stored by day, each its own record) and
§4.3's storage.

### 14.1 Why it reached 2.16 million

One record per search, page, country, device and rich result, for every day
and every kind of result, for sixteen months — each with its own index
entries. No screen reads Google's data at that grain.

### 14.2 What the screens read

| Shape | Read by |
|---|---|
| The website's totals by day | Hero boxes, charts, Google updates |
| Each keyword's and each page's totals for a period | Pages, Keywords, Types, Brand and non-brand, Almost there, Missed demand, Shown but not clicked, Real against estimated, Click rate by position |
| Each keyword with each page, for a period | Keyword counts, top keyword and top page, Pages competing, the detail screens' tables |
| Each keyword week by week | Position bands, New and lost, Wins and losses, the brand trend |
| One page or keyword day by day | A detail screen's chart, only when it is opened |

### 14.3 What is agreed

1. **Three asks a day, for each kind of result**: the website's totals by day;
   each page; each keyword with each page. Plus countries, devices and rich
   results, all small. **Keyword totals are added up from the keyword-and-page
   pairs, never collected on their own** — no doubling. Pages are collected on
   their own because Google folds the rare keywords it hides into a page's
   totals, so a page's real clicks cannot be rebuilt from the pairs.
2. **A day is one record, not one per row**: one record per website, day and
   kind of data, holding that day's whole list. Over 2,000 rows, it is split
   into records of 2,000 — a Convex record holds 1MB at most.
3. **Rolled up as it ages**: days kept for **90 days**, then merged into
   **weeks** (Monday to Sunday, Google's own days, Pacific time); weeks older
   than **12 months** merged into **months**. The website's totals stay daily
   for good — they are tiny. Position is kept as a sum weighted by impressions,
   so an average over any days, weeks or months is exactly Google's.
4. **Thirty days stays the default** ("keep 30 days"). The lists' totals are
   kept ready-made for the last **7, 30 and 90 days and 12 months**, with the
   period before each for the change, rebuilt after each day's collection.
   Thirty days and the thirty before both sit inside the 90 days held daily.
   Any other dates are asked of Google when chosen — free — and a period older
   than 90 days read from storage is counted in whole weeks.
5. **A detail screen's chart asks Google when it opens**: one request, nothing
   kept per page or keyword per day beyond the day records.
6. **Two small registers**: when each keyword and page was first and last
   seen (New and lost), and the types and intents (Sites' own judgments, and
   the Decision Maker's for pages and keywords Sites has not seen).
7. **Collecting stays the Search Console Collector's** (§12): each run the
   newest days and the last four again. **A newly connected website gets its
   last 90 days on the Collector's next scheduled run** (Anthony: "for the
   backfill can we go back 90 days when we first connect a website", then "on
   the next scheduled run") — never on connecting itself. The run finds a
   website with no days held and asks for its 90 days, a week a step, each
   step an action of its own, in that website's own run. Ninety days is
   exactly what is kept as days, so its 30 days, the 30 before and its 90 days
   all read from the first run. **Nothing older is fetched** (Anthony,
   2026-10-02, of fetching months 4 to 16: "so we don't need this then do we
   now"): the history builds up from the day a website is connected, and a
   period longer than what is held says how much is held.
8. **What goes**: the record-per-row tables (`searchConsoleRows`,
   `searchConsoleDays`) and the tables' compact copies of kind `gsc`, replaced
   by the day, week and month records and the ready-made period totals.

9. **Quick to load, all on the server** (Anthony, 2026-10-02: "please ensure
   this is all server side optimised etc with indexes and page speed is kept
   too — these pages need to be quick to load"). Every list screen reads its
   ready-made period — one record, or a few for a long list — by index, and
   searches, filters, sorts and pages it on the server, sending the browser
   only the page of rows shown. No screen adds up days while it loads: that
   is done once, after each collection. Every read uses an index that starts
   with the website's hold; nothing scans a table. Only other dates and a
   detail screen's chart ask Google while the screen opens. A speed test, as
   Sites has (`convex/sitesLoad.test.ts`), times the list reads on a large
   website's worth of rows, so a slow change fails.

**Every limit**: Google returns at most 50,000 rows a day for each kind of
result; a record holds 2,000 rows (Convex: 1MB a record); days 90, weeks 12
months, then months; ready-made periods 7, 30 and 90 days and 12 months. The
search-and-page pairs undercount a little: Google drops some rare rows when
asked for both together.

**Brand words** (Anthony, 2026-10-02: "these are set in the company against a
website"): the brand names already kept for each website — up to 5, with
misspellings — set in Admin → Companies → the company → Websites → the
website → Profile, and already used to find the website in AI answers. Brand
and non-brand reads them; no second list. Its "Change brand words" link goes
to that Profile for the team; a company's own users see the names only.

**Size, estimated for ronins.co.uk**: a few thousand records and about 10–20MB,
against 2.16 million records and about half a gigabyte. To be measured on
ronins.co.uk and kordatackle.com in phase D7.

### 14.4 Phases and days

Data first — every screen reads it — then the screens. Each phase ends with
its tests and the full gate; days are working days, each phase its own go.

| Phase | What | Days |
|---|---|---|
| **D1** | The storage: day, week and month records (pairs, pages, website totals, countries, devices, rich results), weighted position, 2,000-row records; the old record-per-row tables cleared out | 1.5 |
| **D2** | Collecting: the Collector's per-website run makes the three asks for each kind of result and writes day records; a newly connected website's last 90 days on its next scheduled run; the first- and last-seen register | 2 |
| **D3** | Rollups: days past 90 into weeks, weeks past 12 months into months, as part of each website's run | 1 |
| **D4** | Ready-made period totals: 7, 30 and 90 days and 12 months, and the period before each, for keywords, pages and pairs, by type, intent and brand | 1.5 |
| **D5** | Asked of Google when needed: other dates, and the detail screens' charts | 1 |
| **D7** | Measured on ronins.co.uk: records, size, time a run takes (Anthony: "just ronins for now") | 0.5 |
| | **Data** | **7.5** |
| **S1** | Shared parts: the Search Console table on the kit's table and Sites' table bar, hero boxes, the grouped side menu, the website's icon | 1 |
| **S2** | Pages and Keywords: search, filters, sorting, pager, the Track column | 1.5 |
| **S3** | A page's and a keyword's detail: hero boxes, chart, where the clicks came from, their tables | 1.5 |
| **S4** | Tracking: the tracked lists, tick and untick, "Track this page / keyword", the two limits on the Limits screens at all three levels | 1.5 |
| **S5** | Changes: Position bands, New and lost, Wins and losses, Google updates | 2 |
| **S6** | Opportunities: Almost there, Shown but not clicked, Missed demand, Pages competing | 2 |
| **S7** | Breakdowns: Types (sorting pages and keywords Sites has not seen), Brand and non-brand (reading the website's brand names, below), Click rate by position, Rich results, Real against estimated | 2.5 |
| **S8** | Wording in English and Italian; the approved looks locked with drift and look tests; screen-kit entries; checked in Chrome on ronins.co.uk with Anthony | 1.5 |
| | **Screens** | **13.5** |
| | **Total** | **21** |

## 15. Built overnight — 2026-10-02 to 03

Anthony, 2026-10-02: "ok i pluggedin power to the laptop adn need to goto
bed, can y ou start teh build please". Phases D1–D5 and S1–S7 of §14.4 are
built and committed locally (nothing pushed); D7 (measuring ronins.co.uk) and
S8 (Chrome checks with Anthony, locking the looks) are the morning's.

**On dev.** The data layer was sent to the dev backend (23:24, and again at
23:50 with the last pages' reads), once the old rows' clear-out had finished
(none left, the connection kept) and the full local gate had passed —
environment, guards, lint, types, every test with the speed check, the build
and the whitespace check. The Collector's next run asks for ronins.co.uk's
last 90 days, 2026-07-04 to Google's newest day. **Its schedule is switched
off** ("Search Console: Data Collection Schedular", daily at 04:00, found
inactive at 23:51), so nothing came in overnight: switching it on, or one run
by hand, is Anthony's call.

**What is where.**

- `convex/utils/searchConsolePacks.ts` — packing, adding up, weeks and months.
- `convex/searchConsoleSync.ts` — the run's steps and clearing.
- `convex/searchConsoleRollups.ts` — days into weeks into months, per country (moved out of the sync file on 2026-10-03, §16).
- `convex/searchConsoleCountries.ts` — the countries kept ready: the setting, which rows a read uses, clearing a country (§16).
- `convex/searchConsolePeriods.ts` — the ready-made periods and the weeks the
  charts read, built after each run, one kept list at a time.
- `convex/searchConsoleFacts.ts` — Sites' intent, monthly searches, page type
  and estimated visits beside each keyword and page.
- `convex/utils/searchConsoleViews.ts` — each page's rule (Almost there, Shown
  but not clicked, Pages competing, Wins and losses, Missed demand, Real
  against estimated), the filters and the hero boxes' figures: pure, shared by
  the server and the live answers.
- `convex/searchConsoleLists.ts` — every list, read by index and searched,
  filtered, sorted and paged on the server; other dates and one country or
  device asked of Google.
- `convex/searchConsoleChanges.ts` — New and lost, Google updates, Click rate
  by position, brand words.
- `convex/searchConsoleTracking.ts` — tracked keywords and pages, held to the
  Limits.
- The screens: `src/app/(dashboard)/app/search-console/` — the menu, the
  shared list screen, the record screens and the thirteen pages.

**Limits, each said** (Anthony: "say every limit"): lists hold the 25,000 rows
with the most clicks; a kept or ready-made list is read in parts of 2,000 rows,
at most 500 parts a slot; tracked lists are read 500 at a time; Missed demand
reads Sites' 500 most-searched keywords for the website, "searched a lot" from
100 searches a month, "barely shown" under 50 impressions; an estimate more
than a quarter off Google's clicks is too high or too low; the usual click rate
is worked out for positions 1 to 20; the Country chip offers the website's 12
countries with the most clicks; New and lost reads up to 5,000 of each; a
keyword counts as new only once the website has been watched 14 days; Google
updates lists up to 100; the charts show 16 weeks.

**Decisions for Anthony** (not guessed):

1. The drawing's Section chip on Pages ("Top level", "/hub/") was one
   website's folders; Pages has a Page type chip from Sites instead. Keywords
   has an Intent chip beside the drawn ones, so Types can open it narrowed.
2. Table bars count what is shown, as every Sites table does, rather than the
   drawing's "12 of 268 pages".
3. The menu is the Sites section menu — "Jump to a page", folding groups, all
   open — with the first group named "Google's figures".
4. Fan-out's Search Console position: the 14- and 28-day settings read the
   ready-made 30 days now (7 reads 7).
5. The old `gsc` compact copies: clear them and drop the kind.
6. Scale: a rollup merges a day into its week in one mutation, and a website's
   periods are added up in one action. Comfortable for ronins.co.uk; a website
   with ~50,000 keyword-and-page pairs a day would pass Convex's per-function
   limits, so this is split before a large website is connected.
7. Lists asked live (other dates, a country or a device) carry no Sites facts.
8. Real against estimated lists only pages Sites has an estimate for.
9. The Collector's schedule is off: switch it on, or run it once, to bring
   ronins.co.uk's 90 days in.

**Reviewed the same night.** Two independent reviews of the code — the data
layer, and the screens — and what they found put right before morning:

- Adding the periods up runs in the Node runtime now: the default runtime's
  memory is too small for 90 days of a website's keyword-and-page pairs at
  about 28,000 rows a week (§10). Kept weeks are read four at a time and
  months one at a time; rollups a few at a time; clearing five parts a time.
- One keyword's pages, one page's keywords and Pages competing are asked of
  Google for 90 days and 12 months, so no screen reads a whole period of pairs;
  for 7 and 30 days they read the ready-made lists.
- A first 90 days that stopped part-way is fetched again from its start on the
  next run, instead of leaving a gap.
- New and lost no longer drops keywords when more than 500 were first or last
  shown on one day.
- Real against estimated reads Sites' monthly estimate against the days
  chosen; Wins and losses counts a keyword gone altogether as all its clicks
  lost; a brand word matches whole words ("art" is not inside "smart").
- On a list asked of Google, a tick stays a tick as soon as it is made, Sites'
  facts are looked up for its 5,000 rows with the most clicks, and there is no
  download (the file would be the ready-made list, not the one on screen). The
  dates alone decide ready-made or asked of Google, so a search, an order or a
  filter never asks Google again. Days before Google's sixteen months are not
  compared.
- Smaller: address values checked against what each chip offers; New and lost
  says web results only (no kind-of-result switch); the way back no longer
  grows with each hop; a keyword new in the dates reads "New" on Wins and
  losses; the Country chip offers the website's countries whatever the dates.

**Left, for Anthony:**

10. A keyword's totals are added up from its pairs, as agreed. Where Google
    showed two of the website's pages for one search, its impressions count
    twice and its position is the average over both pages, unlike Google's own
    Queries report. Exact figures would need a fourth ask a day, for keywords
    on their own.
11. Brand searches sit in the click rate by position, so the yardstick for
    Shown but not clicked is higher at position 1 than non-brand pages reach.
    It could be worked out from non-brand searches only.
12. While the periods are rebuilt after a run, a list read at that moment can
    show part of a period for a few seconds.

## 16. Countries kept ready — agreed 2026-10-03

Seen on ronins.co.uk: "ai agency" showed as lost, and only its own screen
said it was lost in Mozambique, where Ronins doesn't trade. Only 51.5% of
the website's last 30 days' clicks came from the United Kingdom, spread
across 213 countries. Anthony: a country choice beside the date boxes, and
"the country dropdown will expose this".

### 16.1 His decisions

1. **Countries are set only in admin** — the websites section's Market page
   (drawn on the canvas as board 18, inputs only: "this is an admin screen we
   don't want results on it"), under What we track. "Where you watch from"
   moves there from Schedules, as drawn, so the two place settings sit
   together and nothing is set twice.
2. **The choice opens on All countries.** The drawing's "Search Console
   opens on this" goes.
3. **Several countries per website**, in the order added, per company (like
   the place: another company watching the same website sets its own).
4. **Speed is important.** Each country on the website's list is collected
   and made ready at every collection, so choosing it is as quick as all
   countries. Any other country is asked of Google live, as other dates are.
5. **The number is a limit, set the usual way**: "Countries kept ready per
   website" on the Limits page (Search Console), per company and per website,
   choices 1, 2, 3, 5 or 10, 3 until set (`consoleCountriesPerSite`). "Any
   limit should be configurable in the usual limits way, nothing should be
   hidden." Past it, the countries added first are kept.

### 16.2 The design

- **The setting**: `searchConsoleCountries` on the company's hold
  (`companyWebsites`), Google's three-letter codes in lower case
  (`gbr`), checked against `convex/utils/countryCodes.ts`. Set by a
  super admin only, as the place is.
- **What is kept**: `country` on `searchConsoleDays`, `searchConsoleLists`,
  `searchConsolePeriods`, `searchConsoleWeeks` and `searchConsoleSeen`.
  Missing means all countries, so every row already held stays as it is.
  Each index leads with the hold, then the country, then what it led with
  before, so a read of one country never passes over another's rows.
- **Collecting**: for each country on the list, each step asks the same as
  for all countries with Google's country filter — each kind's day totals,
  then each day's searches-with-pages, pages, devices and search
  appearances. No country list inside a country. A country new to the list
  holds nothing and is fetched over the same 90 days. About 80% more Google
  requests per country; rows in line with its share of the searches.
- **Adding up**: the weeks-and-months roll-up, the ready-made periods, the
  weekly figures with Sites' facts, and the seen register (new and lost) are
  built for each country exactly as for all countries.
- **Taking a country off**: what was kept for it is deleted in the
  background, a chunk at a time.
- **Reading**: every Search Console read takes an optional `country`.
  On the list, it reads that country's ready-made figures. Not on it, it asks
  Google live with the country filter (the path the tables' Country filter
  used). Missing, all countries, as before.
- **The screens**: the choice sits beside the date boxes on every Search
  Console page (the kit's `Select`), the website's countries first, then
  every other country; it is kept in the address (`?country=gbr`) so links
  and the back button keep it. The Keywords and Pages tables lose their own
  Country filter — one country choice per page. Countries and devices keeps
  every country in its countries table; its devices follow the choice.

### 16.3 As built — 2026-10-03

- **Held days per country**: `countriesHeld` on the connection (country,
  oldest and newest day), joined step by step as all countries' are. A
  country with no entry gets the whole 90 days; taking a country off forgets
  its held days, so putting it back fetches them all again.
- **A run**: all countries first, then each kept country in turn, each step
  within the same 4 minutes and 4 asks at a time. Countries past the limit
  are cleared as the run starts.
- **Each page with a country chosen**:
  - kept ready — read from that country's own ready-made figures;
  - not kept ready (or kept but not yet collected) — the figures, charts,
    every list, the devices table, Click rate by position and Google updates
    are asked of Google live, and the "Figures to …" line adds "Asked of
    Google when chosen, so it takes a moment";
  - New and lost, and the weekly charts on Position bands and Brand and
    non-brand, can't be asked live: they say the country isn't kept ready
    and to add it on the Market page;
  - Countries and devices, and a keyword's or page's "Where the clicks came
    from": every country always; devices follow the choice.
- **Market page** (admin, What we track): "Where it trades" (countries in
  order, Add a country, the limit with a link to Limits, any past the limit
  marked "Not kept ready") and "Where you watch from" (moved from Schedules),
  one Save. The last country can be removed: Search Console no longer opens
  on it. All websites shows each website's countries and place.
- **Files**: `searchConsoleCountries.ts` (setting, which rows a read uses,
  clearing), `searchConsoleRollups.ts` (moved out of the sync file),
  `searchConsoleWeekFigures` replaces `searchConsoleWeeks`.

### 16.4 Limits, said

- Countries kept ready per website: 1, 2, 3, 5 or 10; 3 until set.
- Days fetched for a country new to the list: the same 90 as all countries.

## 17. Drift audit and fixes — 2026-10-03

Anthony, 2026-10-03, on Pages competing taking half a minute on Last year:
"why is this page so slow", then "for a selected home countries and all
countries it should be really quick" and "Can you audit the search console
section and see if the agent kept it true as i think they drifted". Three
audits read the section against this plan and the drawings — speed and data,
the screens, and the decisions and limits. Of the findings his answers were:
"lets fix 1" (speed), "2 is ok we are only going back 90 days in the plan"
(a "Last year" read from storage covers the 90 days held), "fix 3 and 4"
(decisions taken without him; the screens against the drawings) and "5 — we
need limits in the limits sections". Asked three questions, he chose: keep
the kind-of-result tabs; every limit that changes what a screen shows goes on
the Limits page, internal work sizes written here; keywords Sites has never
seen stay "Not judged yet".

Where they differ, this section supersedes §15's Decisions 1, 4 and 7, §15's
"Reviewed the same night" (the asks of Google for 90 days and 12 months, no
download on lists asked of Google, New and lost web results only), §15's
"Limits, each said", §10's 250 rows of a pairing, and the "all open" menu
(Decision 3, settled in his words in 3551a567: most groups closed).

### 17.1 What had drifted

- **Speed (§14.3 item 9, §16.1 item 4).** Pages competing, one keyword's
  pages and one page's keywords asked Google for 90 days and 12 months, for
  all countries and countries kept ready alike: decided by the night review on
  memory grounds, never asked. A year of Pages competing took 33 seconds: about
  7 asking Google for this year and the year before, one after the other, and
  about 26 looking up Sites' intent and searches for 5,000 keywords, 200 at a
  time, one after another — the reversal of Decision 7, also never asked. The
  90-day and 12-month pair lists were built after every collection and read by
  nothing. Rich results asked Google once per kind, one after another, every
  time it opened. A kept country a day behind fell back to Google. In
  development each ask went to Google twice. The speed test counted only
  Keywords on 30 days.
- **Built or changed without his go.** The thirteen pages of §13.3 ("drawn to
  be looked at; none agreed"); the night review's changes; Decisions 1, 4 and 8
  settled in code; S7's "type for unseen pages" called built when it was not;
  two "show all countries" screens from "maybe with a show all on another page".
- **Screens against the drawings.** Kind-of-result tabs on every page (in no
  drawing); Download all missing on four pages and on every list asked of
  Google; chart tick boxes missing; bars in Countries and devices' rows; a globe
  for the website's icon; "Share of clicks" for "Share"; New and lost's Device
  filter gone; Position bands' Band column not sortable; the Tracked group's
  boards (19–21) never saved to the repo.
- **Limits never said.** About a dozen caps and thresholds fixed in code.
- **Not done.** D7 (measuring ronins.co.uk) and most of S8 (no look tests or
  binding spec; Italian is done).

### 17.2 Speed, as built

- **Every list reads what is kept ready, for every period.** After each
  collection the pairs are written twice in key order — by keyword (`pair`) and
  by page (`pairByPage`), each part with its first key — so one keyword's pages
  and one page's keywords are read by index: the parts starting with it and the
  one before (`readKeyed`). Pages competing has its own list, `competing`: only
  the pairs of keywords two or more pages were shown for, and how many pages
  Google showed at all. Nothing on those pages asks Google for 7, 30 or 90 days
  or 12 months, in all countries or a country kept ready; only other dates, one
  device or a country not kept ready do, as §14.3 agreed.
- **Rich results' pages per kind** are counted once after each collection for
  the ready-made periods (one ask per kind, four at a time) and read
  ready-made; the page asks Google only for other dates, one device, a country
  not kept ready, or when Google was busy during the build.
- **Lists asked of Google** ask for the dates and the days before at the same
  time (and a list of pages its pairs and pages at once); Sites' facts are
  looked up after the page's rule, so Pages competing looks up only its
  competing keywords, eight lookups at once; Real against estimated, which
  chooses its rows by Sites' estimates, looks them up first.
- **A kept country** reads to its own newest day (the status carries each
  kept country's newest day), so its quick picks read its ready-made figures.
- **The same ask is sent once**: two parts of a page, or React's development
  double-run, share one ask of Google.
- **"Where the clicks came from"** stays asked of Google (no list per keyword
  per country is kept), its countries and devices asked at the same time.
- **The speed test** (`searchConsoleListsLoad.test.ts`) now also holds one
  keyword's pages, one page's keywords and Pages competing over 12 months to a
  few parts by index on a website of 60,000 pairs, and a website's own list
  limit. Counted, not timed (AGENTS.md, "Test time limits").
- **Measured on ronins.co.uk (dev), all countries:** Pages competing for 12
  months, 2,178 keywords; the United Kingdom, 1,940; one keyword's pages and
  the home page's 576 keywords — each about a second from the command line,
  its own start-up of about a second included. It was 33 seconds.
- **Rebuilt on dev, 2026-10-03**, from what was kept, no collection:
  `searchConsoleSettle.rebuildSitePeriods` for ronins.co.uk, all countries and
  the United Kingdom.
- **Fan-out (Decision 4):** its 14- and 28-day settings read their own
  ready-made keyword lists, web, all countries (`FAN_OUT_PERIODS`), not the 30
  days; the 30 days until a website's next build.
- The Google pairing action no screen used any more (`searchConsolePairing`,
  `usePairing`) is removed.

### 17.3 The decisions taken without him, now

- **The thirteen pages** stay: "fix" kept them, recorded here.
- **Download all on a list asked of Google** is back, built on the page from
  the rows it holds, in the order and with the search on screen.
- **New and lost reads every kind of result**, with the tabs: the first- and
  last-seen register carries the kind (missing is web, every row held before),
  collecting files each kind, and the kinds other than web were filled from the
  90 days held (`searchConsoleSettle.fillSeenRegister`, run on dev 2026-10-03).
- **Decision 1:** Pages' Page type filter names the website's own
  classifications once it has any (page-groups-plan.md) — what the drawn
  Section filter was for.
- **Decision 7:** Sites' facts stay on lists asked of Google, for the rows the
  page lists, up to a limit — so the Intent and Page type filters still work on
  other dates. Decision 7 had said none; **his call** if he wants none.
- **Kept as the night review built them, for him to overrule:** Real against
  estimated reads Sites' monthly estimate against the days chosen; Wins and
  losses counts a keyword gone altogether as all its clicks lost; a brand word
  matches whole words; days before Google's sixteen months are not compared.
  Each corrects a wrong answer.
- **Decision 8** (Real against estimated lists only pages with an estimate)
  stays: the drawing shows the same.
- **Keywords Sites has never seen** stay "Not judged yet" (his answer); pages
  are named by his classifications.
- **The "show all countries" screens** stay; how many countries the panel shows
  is a limit.
- **The kind-of-result tabs** stay (his answer).

### 17.4 The screens against the drawings

Fixed: Download all on Google updates, New and lost, Rich results and Click
rate by position, and on Countries and devices' tables and both "all
countries" screens, each with its own search box; the chart tick boxes on
Position bands, New and lost, Brand and non-brand and Click rate by position;
Google updates' chart clicks only, with the drawing's hint; no bars in
Countries and devices' rows; the website's own icon (Sites' `SiteMark`, with
its icon) in the header and the list; "Share" on Pages competing; Position
bands' Band column sorts, the top band first. Boards 18–21 are saved in
`docs/plans/assets/search-console-redesign/` with the canvas as it is now
(`canvas.json` also lists boards 22–23, page-groups-plan.md's).

Not done: **New and lost's Device filter** — the register keeps no device,
so it needs devices collected per keyword: his call. Left as they are: the
section menu's width (Sites' shared menu, 240px against the drawing's 200),
and the header's "Updated …" and "Google's figures to …" lines.

### 17.5 Limits, each on the Limits page

A new group, **Search Console screens**, on the Limits page at all three
levels (System Settings → Limits for the default, a company's, a website's),
beside Search Console's tracking and countries:

| Limit | Choices | Until set |
|---|---|---|
| Rows a Search Console list holds | 5,000 · 10,000 · 25,000 | 25,000 |
| Rows on a keyword's or a page's own screen | 1,000 · 2,500 · 5,000 · 8,000 | 8,000 |
| Rows given intent and searches on a list asked of Google | 1,000 · 2,500 · 5,000 · 10,000 | 5,000 |
| Kinds of rich result whose pages are counted | 5 · 10 · 20 · 40 | 20 |
| Countries beside a keyword's or a page's chart | 3 · 5 · 10 | 5 |
| New and lost keywords read | 1,000 · 2,500 · 5,000 | 5,000 |
| Days watched before a keyword counts as new | 7 · 14 · 28 | 14 |
| Days unseen before a keyword counts as lost | 7 · 14 · 28 | 14 |
| Sites keywords Missed demand reads | 250 · 500 · 1,000 | 500 |
| Searches a month that count as searched a lot | 50 · 100 · 250 · 500 | 100 |
| Impressions under which a keyword is barely shown | 10 · 25 · 50 · 100 | 50 |
| How far an estimate can be from Google's clicks | 10% · 25% · 50% | 25% |
| Positions the usual click rate is worked out for | 10 · 20 · 30 | 20 |
| Google updates listed | 25 · 50 · 100 · 200 | 100 |
| Days read either side of a Google update | 7 · 14 · 28 | 14 |
| Weeks the weekly charts show | 8 · 16 · 26 · 52 | 16 |
| Longest date range | 365 · 500 · 800 days | 800 |

"Days read either side of a Google update" was not on the list he saw; it is
a rule of the same kind, so it joined. The screens' words name each number
from the limit ("lost when Google has not shown you for it in 14 days").

**Internal work sizes, written here, not set:** facts looked up 200 keys an
ask, eight asks at once; a list sent to the page in parts of 8,000 (Convex
carries 8,192 items in an array); kept and ready-made records of 2,000 rows;
Google asked four at a time, four minutes a step, its result pages 25,000
rows; rich results counted four kinds at once; roll-ups 200 a run, 100 rounds;
a ready-made slot read as at most 500 parts and kept lists 900 records (past
that a build stops and says so); kept days read 15 at a time, weeks 4;
register pages of 500; a disconnect hands Google's access back while no more
than 200 websites share the account.

### 17.6 Left for Anthony

- Decision 7 (above): facts on lists asked of Google, or none.
- The night review's four rules (above).
- New and lost's Device filter: collect devices per keyword, or leave it out.
- D7 (measure ronins.co.uk) and S8 (the approved looks locked with look and
  drift tests and a binding spec, and checked in Chrome with him).
- Still open from §15: item 5 (the old `gsc` compact copies), items 10–12.

## 18. Charts in the dates chosen — 2026-10-04

Anthony, on Position bands: "everytime i move the date range nothing
changes". An audit of all 43 charts in Search Console and Sites found four
that ignored the dates and two whose captions said otherwise; he answered "do
it all and agree", and of Daily reaching past the days kept as days, "switch to
weekly when it goes back".

- **Position bands and Brand and non-brand**: `searchConsoleWeeks` now holds
  each day (the 90 days kept as days), week and month the charts reach
  (`grain`; `week` is the period's first day), and how many of its days are
  held (`days`), built after each collection by the rule every period uses
  (`keptIn`). `searchConsoleChartFigures` returns those touching the dates, in
  the step chosen. Daily dates reaching past the 90 days are drawn by week and
  say so; dates past the charts' weeks (`consoleChartWeeks`, 16) start at the
  first of them and say so. A part-week or part-month at an edge of the
  history is drawn lighter — fainter bars, an open ring on a line — and its
  hover names its days ("28 Sep – 2 Oct, 5 days"). Rows built before this
  carry no grain and read as weeks; days and months appear after the next
  collection, and until then the chart says so.
- **New and lost**: the chart is the same keywords the counts and list hold,
  in each day, week or month of the dates (`step`), no longer the last 16
  weeks.
- **Google updates**: the list holds the updates that began in the dates, each
  still compared on the days either side of it however far outside the dates
  they fall; the chart draws the dates in their step.
- **Sites**: the Overview's twelve months against the twelve before keeps its
  own dates, and its caption now says them; Google searches and a keyword's
  own page draw a point per day, week or month, each at its last day's
  position, as every Sites level does.

Then, seen on ronins.co.uk's own pages in his Chrome, three more ("yes pls"):

- **New and lost counted every one**: its list reads at most
  `consoleNewLostRows` (5,000) of each, so on a busy website the counts read
  5,000 and July read as nothing. `searchConsoleSeenDays` holds how many the
  register has as first shown, and as last shown, on each day, counted from
  the whole register after each collection (`searchConsoleSeenDays.ts`); the
  four counts and the chart read it, the table keeps its limit, and until the
  first count the lists are read as before.
- **The line charts' part-weeks**: Performance, Google updates and a search's
  or page's own chart dipped at the edges of the dates, a week holding two
  days drawn as a fall. A week or month cut by the dates or the history now
  wears the open ring, and its hover names its days.
- **Brand and non-brand's colours**: amber against blue, where amber against
  orange read as one line.

**Limits, said**: the charts' weeks (16, on the Limits page) still bound how
far back Position bands and Brand reach; days are kept as days for 90 days;
New and lost's table reads 5,000 of each, its counts and chart every one.

## 19. Audit of Sites and Search Console — 2026-10-04

Every page of both sections opened in Anthony's own Chrome on ronins.co.uk:
no errors, every chart drawn, the dates, step, sorts, searches, pages, filters,
kind of result and country all working. Eight things found, all fixed on his
"yes fix all eight":

1. **Section links**: Google reports a click on a link to a heading of a page
   ("…/#types-and-uses") as a page of its own. Rows now show the section
   (`pageLabel`), and wherever pages are compared or counted a section link is
   part of its page (`withSectionsInPages`, `pageWithoutSection`): Shown but
   not clicked, Real against estimated (one page had read "1,018 too high"
   seven times; "too high" fell from 97 pages to 27), Pages competing, and
   the counts by classification (Content hub 196 rows, 53 pages). Lists of
   Google's own rows — Pages — still list section links, marked as such.
2. **A followed link opened the next page partway down**: the dashboard's
   column (`FluidWorkspace`) scrolls itself, so it now starts each new page
   at its top and returns Back and Forward to their place.
3. **Sorting threw the reader to the page's top**: the table empties while a
   new sort, filter or search loads; it now keeps its height meanwhile
   (`DataTable`).
4. **16px in 12px tables**: missing figures' dashes on eighteen screens, now
   the kit's `NoFigure`; Countries and devices' country names, now 13px.
5. **Click rate by position's scale** ran to 4 for rates under 1, with no %:
   `SiteBarChart`'s `formatScale`.
6. **A search's or page's chart** said "by day" whatever the step.
7. **Tracked fan-out queries**' headings wrapped when the table was empty.
8. **New and lost's Lost** in blue, where amber and orange read as one.

And on his word, Breakdowns' "Types" is "By page classification" (menu and
title).

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
- **2026-10-02** — The data agreed (§14): three asks a day (website totals,
  pages, keyword-and-page pairs; keyword totals added up from the pairs), a
  day as one record, days for 90 days then weeks then months, 30 days kept as
  the default with ready-made period totals, detail charts asked of Google
  live. SC6 and §4.3 superseded. The build in phases: data 7.5 days, screens
  13.5, about 21 in all.
- **2026-10-02** — A newly connected website's last 90 days come in on the
  Collector's next scheduled run, as days (§14.3, item 7). D2 2 days; data 8,
  about 21.5 in all.
- **2026-10-02** — The tracking limits chosen: 200 keywords and 100 pages a
  website by default, each a dropdown on the Limits screens (§13.2).
- **2026-10-02** — Brand words are the website's brand names in its Profile;
  D7 measured on ronins.co.uk only; S8's Chrome checks and locking the looks
  done with Anthony (§14).
- **2026-10-02** — No history older than 90 days is fetched; D6 dropped. Data
  7.5 days, about 21 in all (§14).
- **2026-10-02** — Quick to load, all on the server, by index, held by a speed
  test (§14.3, item 9).
- **2026-10-03** — Built overnight on Anthony's go: D1–D5 and S1–S7, all 17
  drawn screens (§15). Committed locally, data layer on dev; the Collector's
  schedule found switched off, so no figures yet. D7, S8 and nine decisions
  are the morning's.
- **2026-10-03** — Two reviews of the night's code; what they found put right
  (memory and size limits for a busy website, gaps, wrong answers on four
  pages) and three things left for Anthony (§15, items 10–12).
- **2026-10-03** — The UI clean-up (Anthony: "we need to keep a ui standard
  app wide"; "yes lets do it all"): the screens take the shared kit parts —
  `Figure`, `Notice`, `ChartCard`, `TableBar`, `Change`, `Meter`, `KindBars` —
  instead of Search Console's own copies. Disconnecting now asks its yes-or-no
  in the kit's pop-up (`ConfirmationModal`), which AGENTS.md allows since
  2026-10-01 ("a pop-up is only for a yes or a no"); every screen above is
  still a screen, never a pop-up.
- **2026-10-03** — Countries kept ready (§16): Anthony's four answers — set
  only in admin, opens on All countries, several per website, speed matters —
  and a limit on the Limits page, "nothing should be hidden".
- **2026-10-03** — Drift audit and fixes (§17), on Anthony's answers ("lets
  fix 1", "fix 3 and 4", "we need limits in the limits sections"): every
  period read ready-made — Pages competing for a year from 33 seconds to about
  one; Rich results counted after each collection; New and lost for every kind
  of result; the screens put back to the drawings; seventeen Search Console
  limits on the Limits page; three things left for him.
- **2026-10-04** — Charts in the dates chosen (§18): Position bands, Brand and
  non-brand, New and lost and Google updates follow the dates and step; Daily
  past the 90 days kept as days is drawn by week; part-weeks are drawn as
  such; two Sites captions and steps put right.
- **2026-10-04** — Then three seen on the real pages: New and lost counts
  every keyword from counts kept by day, not the 5,000 its list reads; the
  line charts mark part-weeks; Brand and non-brand in amber and blue.
- **2026-10-04** — The audit (§19): section links shown on their rows and
  part of their page wherever pages are compared or counted; pages open at
  their top and Back returns to its place; sorting keeps the reader's place;
  `NoFigure`; the click-rate scale; "By page classification".
